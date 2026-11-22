package com.gruent.steps.plugins.existence.v1

import com.gruent.steps.api.ConditionalStep
import com.gruent.steps.api.ExecutionContext
import com.gruent.steps.api.LogLevel
import com.gruent.steps.api.Step
import com.gruent.steps.api.StepCategory
import com.gruent.steps.api.StepConfigurationException
import com.gruent.steps.api.StepFactory
import com.gruent.steps.api.StepMessage
import com.gruent.steps.api.StepSpec
import com.gruent.steps.config.ConfigValidationException
import com.gruent.steps.data.FieldPath
import com.gruent.steps.data.Payloads
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/** Creates `existence@1` steps. */
class ExistenceStepFactory : StepFactory {
  override val pluginType: String = ExistenceConfig.pluginType
  override val pluginVersion: Int = ExistenceConfig.pluginVersion
  override val definitionDigest: String = ExistenceConfig.definitionDigest
  override val category: StepCategory = StepCategory.CONDITIONAL

  override fun create(spec: StepSpec): Step {
    val config = try {
      ExistenceConfig.decode(spec.configJson)
    } catch (e: ConfigValidationException) {
      throw StepConfigurationException("invalid configuration for step ${spec.stepId}: ${e.message}", e)
    }
    // The controller resolves the model (and the selected fields) into the paths to check.
    val compiled = spec.compiledJson
      ?: throw StepConfigurationException("step ${spec.stepId} has no compiled field paths in the plan")
    val paths = try {
      val obj = Json.parseToJsonElement(compiled) as JsonObject
      (obj.getValue(COMPILED_PATHS) as JsonArray).map { FieldPath.parse((it as JsonPrimitive).content) }
    } catch (e: Exception) {
      when (e) {
        is SerializationException, is ClassCastException, is NoSuchElementException, is IllegalArgumentException ->
          throw StepConfigurationException("step ${spec.stepId} has invalid compiled field paths: ${e.message}", e)
        else -> throw e
      }
    }
    return ExistenceStep(paths, config.match, config.nullIsMissing ?: true)
  }

  companion object {
    /** The plan step's `compiled.paths`: the model fields to check, in variable syntax. */
    const val COMPILED_PATHS = "paths"
  }
}

/**
 * Checks that fields of a model are present in the input (ported from the legacy existence node).
 *
 * The legacy node checked selected model attributes and required all of them. This step checks the paths
 * that the controller compiled from the model (every leaf field, or the selected fields), and passes when
 * every field ([ExistenceConfig.Match.ALL]) or at least one ([ExistenceConfig.Match.ANY]) is present. A
 * path through an array is present when every item has the field. Input that is not a JSON object, and
 * signals, fail the condition rather than the execution, like the legacy node's invalid data.
 */
class ExistenceStep(
  private val paths: List<FieldPath>,
  private val match: ExistenceConfig.Match,
  private val nullIsMissing: Boolean,
) : ConditionalStep() {
  override suspend fun evaluate(message: StepMessage, context: ExecutionContext): Boolean {
    if (message.kind == StepMessage.Kind.SIGNAL) {
      context.logger.log(LogLevel.WARN, "Input is a signal without fields", emptyMap())
      return false
    }
    val input = Payloads.parseJson(message.payload) as? JsonObject
    if (input == null) {
      context.logger.log(LogLevel.WARN, "Input is not a JSON object", emptyMap())
      return false
    }
    val missing = paths.filter { it.missing(input, nullIsMissing) }
    val pass = when (match) {
      ExistenceConfig.Match.ALL -> missing.isEmpty()
      ExistenceConfig.Match.ANY -> paths.isEmpty() || missing.size < paths.size
    }
    val attributes = buildMap {
      put(ATTRIBUTE_RESULT, if (pass) StepMessage.PORT_SUCCESS else StepMessage.PORT_FAILURE)
      if (missing.isNotEmpty()) put(ATTRIBUTE_MISSING, missing.joinToString(", "))
    }
    context.logger.log(LogLevel.DEBUG, if (pass) "Fields are present" else "Fields are missing", attributes)
    return pass
  }

  companion object {
    const val ATTRIBUTE_RESULT = "result"
    const val ATTRIBUTE_MISSING = "missingFields"
  }
}
