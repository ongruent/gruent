package com.gruent.steps.plugins.log.v1

import com.gruent.steps.api.ExecutionContext
import com.gruent.steps.api.LogLevel
import com.gruent.steps.api.MessageStep
import com.gruent.steps.api.Redaction
import com.gruent.steps.api.Step
import com.gruent.steps.api.StepCategory
import com.gruent.steps.api.StepConfigurationException
import com.gruent.steps.api.StepFactory
import com.gruent.steps.api.StepMessage
import com.gruent.steps.api.StepSpec
import com.gruent.steps.config.ConfigValidationException
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import java.nio.ByteBuffer
import java.nio.charset.CharacterCodingException
import java.nio.charset.CodingErrorAction
import java.util.Base64

/** Creates `log@1` steps. */
class LogStepFactory : StepFactory {
  override val pluginType: String = LogConfig.pluginType
  override val pluginVersion: Int = LogConfig.pluginVersion
  override val definitionDigest: String = LogConfig.definitionDigest
  override val category: StepCategory = StepCategory.ACTION

  override fun create(spec: StepSpec): Step {
    val config = try {
      LogConfig.decode(spec.configJson)
    } catch (e: ConfigValidationException) {
      throw StepConfigurationException("invalid configuration for step ${spec.stepId}: ${e.message}", e)
    }
    if (config.redactionModelId != null && spec.redaction == null) {
      // The controller resolves the model into redaction paths. Without them, logging the input would leak
      // the fields the user marked as sensitive.
      throw StepConfigurationException("step ${spec.stepId} has a sensitive fields model but the plan has no redaction paths")
    }
    return LogStep(config, spec.redaction)
  }
}

/**
 * Records the step's input in the channel's execution logs (ported from the legacy log node).
 *
 * The legacy node logged at info level with a "Data (type N): …" body, and pretty-printed JSON. This step
 * logs at the configured level, uses the configured message as the body, and records the input in the
 * `data` attribute: JSON is pretty-printed after redaction, other UTF-8 text is recorded as is, and binary
 * input is recorded as base64. Signals (e.g. timer ticks) carry no data.
 *
 * Redaction fails closed: when the plan lists sensitive fields and the input is not JSON, the entry is
 * recorded without the input.
 */
class LogStep(
  private val config: LogConfig,
  private val redaction: Redaction?,
) : MessageStep() {
  override suspend fun process(message: StepMessage, context: ExecutionContext, emit: suspend (StepMessage) -> Unit) {
    context.logger.log(level(), body(message), attributes(message))
  }

  private fun level(): LogLevel = when (config.level) {
    LogConfig.Level.DEBUG -> LogLevel.DEBUG
    LogConfig.Level.INFO -> LogLevel.INFO
    LogConfig.Level.WARN -> LogLevel.WARN
    LogConfig.Level.ERROR -> LogLevel.ERROR
  }

  private fun body(message: StepMessage): String {
    val configured = config.message?.takeIf { it.isNotBlank() }
    if (configured != null) return configured
    return if (message.kind == StepMessage.Kind.SIGNAL) "Signal received" else "Input received"
  }

  private fun attributes(message: StepMessage): Map<String, String> {
    if (message.kind == StepMessage.Kind.SIGNAL) {
      return mapOf(ATTRIBUTE_INPUT to "signal")
    }
    val attributes = linkedMapOf(ATTRIBUTE_INPUT to "data")
    message.contentType?.let { attributes[ATTRIBUTE_CONTENT_TYPE] = it }

    val json = parseJson(message.payload)
    when {
      json != null -> {
        val redacted = redaction?.let { redact(json, it) } ?: json
        putData(attributes, prettyJson.encodeToString(JsonElement.serializer(), redacted), null)
      }
      redaction != null -> attributes[ATTRIBUTE_PAYLOAD_OMITTED] = "input is not JSON, so sensitive fields cannot be redacted"
      else -> {
        val text = decodeUtf8(message.payload)
        if (text != null) {
          putData(attributes, text, null)
        } else {
          putData(attributes, Base64.getEncoder().encodeToString(message.payload), "base64")
        }
      }
    }
    return attributes
  }

  private fun putData(attributes: MutableMap<String, String>, data: String, encoding: String?) {
    if (data.length > MAX_DATA_CHARS) {
      attributes[ATTRIBUTE_DATA] = data.substring(0, MAX_DATA_CHARS)
      attributes[ATTRIBUTE_DATA_TRUNCATED] = "true"
    } else {
      attributes[ATTRIBUTE_DATA] = data
    }
    encoding?.let { attributes[ATTRIBUTE_DATA_ENCODING] = it }
  }

  companion object {
    /** The recorded input. The hub renders this attribute (see StepExecutionLogEntry). */
    const val ATTRIBUTE_DATA = "data"
    const val ATTRIBUTE_DATA_ENCODING = "dataEncoding"
    const val ATTRIBUTE_DATA_TRUNCATED = "dataTruncated"
    const val ATTRIBUTE_INPUT = "input"
    const val ATTRIBUTE_CONTENT_TYPE = "contentType"
    const val ATTRIBUTE_PAYLOAD_OMITTED = "payloadOmitted"

    /** Upper bound of the recorded input, so a large payload can't flood the log pipeline. */
    const val MAX_DATA_CHARS = 64 * 1024

    private val json = Json
    private val prettyJson = Json { prettyPrint = true }

    private fun parseJson(payload: ByteArray): JsonElement? {
      val text = decodeUtf8(payload) ?: return null
      if (text.isBlank()) return null
      return try {
        json.parseToJsonElement(text).takeUnless {
          // The parser accepts bare words such as `hello`; the only unquoted JSON values are numbers,
          // booleans and null.
          it is JsonPrimitive && !it.isString && it.content !in setOf("true", "false", "null") && it.content.toBigDecimalOrNull() == null
        }
      } catch (_: SerializationException) {
        null
      } catch (_: IllegalArgumentException) {
        null
      }
    }

    private fun decodeUtf8(payload: ByteArray): String? = try {
      Charsets.UTF_8.newDecoder()
        .onMalformedInput(CodingErrorAction.REPORT)
        .onUnmappableCharacter(CodingErrorAction.REPORT)
        .decode(ByteBuffer.wrap(payload))
        .toString()
    } catch (_: CharacterCodingException) {
      null
    }

    /**
     * Replaces the value at every path of [redaction]. Paths use variable syntax: `a.b` descends into
     * objects and `a[].b` into every item of an array. Missing fields are ignored.
     */
    fun redact(element: JsonElement, redaction: Redaction): JsonElement {
      val replacement = JsonPrimitive(redaction.replacement)
      return redaction.paths.fold(element) { current, path ->
        redactPath(current, parsePath(path), replacement)
      }
    }

    private data class Segment(val name: String, val arrayDepth: Int)

    private fun parsePath(path: String): List<Segment> = path.split('.').map { raw ->
      var name = raw
      var depth = 0
      while (name.endsWith("[]")) {
        name = name.removeSuffix("[]")
        depth++
      }
      Segment(name, depth)
    }

    private fun redactPath(element: JsonElement, segments: List<Segment>, replacement: JsonElement): JsonElement {
      if (segments.isEmpty()) return replacement
      val obj = element as? JsonObject ?: return element
      val segment = segments.first()
      val child = obj[segment.name] ?: return element
      val rest = segments.drop(1)
      val updated = if (segment.arrayDepth == 0) {
        redactPath(child, rest, replacement)
      } else {
        redactItems(child, segment.arrayDepth, rest, replacement)
      }
      return JsonObject(obj + (segment.name to updated))
    }

    private fun redactItems(element: JsonElement, depth: Int, rest: List<Segment>, replacement: JsonElement): JsonElement {
      val array = element as? JsonArray ?: return if (rest.isEmpty()) replacement else element
      return JsonArray(
        array.map { item ->
          if (depth > 1) redactItems(item, depth - 1, rest, replacement) else redactPath(item, rest, replacement)
        },
      )
    }
  }
}
