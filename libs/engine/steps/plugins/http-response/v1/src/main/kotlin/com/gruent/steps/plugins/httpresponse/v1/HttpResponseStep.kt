package com.gruent.steps.plugins.httpresponse.v1

import com.gruent.steps.api.ExecutionContext
import com.gruent.steps.api.LogLevel
import com.gruent.steps.api.MessageStep
import com.gruent.steps.api.Response
import com.gruent.steps.api.Step
import com.gruent.steps.api.StepCategory
import com.gruent.steps.api.StepConfigurationException
import com.gruent.steps.api.StepFactory
import com.gruent.steps.api.StepMessage
import com.gruent.steps.api.StepSpec
import com.gruent.steps.config.ConfigValidationException

/** Creates `http-response@1` steps. */
class HttpResponseStepFactory : StepFactory {
  override val pluginType: String = HttpResponseConfig.pluginType
  override val pluginVersion: Int = HttpResponseConfig.pluginVersion
  override val definitionDigest: String = HttpResponseConfig.definitionDigest
  override val category: StepCategory = StepCategory.ACTION

  override fun create(spec: StepSpec): Step {
    val config = try {
      HttpResponseConfig.decode(spec.configJson)
    } catch (e: ConfigValidationException) {
      throw StepConfigurationException("invalid configuration for step ${spec.stepId}: ${e.message}", e)
    }
    val headers = linkedMapOf<String, MutableList<String>>()
    for (line in config.headers.orEmpty()) {
      val name = line.substringBefore(':').trim()
      headers.getOrPut(name) { mutableListOf() }.add(line.substringAfter(':').trim())
    }
    return HttpResponseStep(config.statusCode.toInt(), config.body, headers)
  }
}

/**
 * Answers the HTTP request that started the execution (ported from the legacy HTTP response node, which
 * wrote its input to the source's pending request).
 *
 * The first input becomes the response: the configured status, the input as the body (or none) with the
 * input's content type unless a header sets it, and the configured headers. The runtime sends it once the
 * execution completes, so steps after this one still run. Later inputs, and inputs of executions without a
 * request to answer (e.g. timers), are recorded as warnings.
 */
class HttpResponseStep(
  private val status: Int,
  private val body: HttpResponseConfig.Body,
  private val headers: Map<String, List<String>>,
) : MessageStep() {
  override suspend fun process(message: StepMessage, context: ExecutionContext, emit: suspend (StepMessage) -> Unit) {
    val responseHeaders = LinkedHashMap(headers)
    val payload = if (body == HttpResponseConfig.Body.INPUT && message.kind == StepMessage.Kind.DATA) message.payload else null
    if (payload != null && message.contentType != null && headers.keys.none { it.equals(CONTENT_TYPE, ignoreCase = true) }) {
      responseHeaders[CONTENT_TYPE] = listOf(message.contentType!!)
    }
    if (!context.respond(Response(status, responseHeaders, payload))) {
      context.logger.log(LogLevel.WARN, "The request was already answered, or the execution has no request to answer", emptyMap())
    }
  }

  companion object {
    const val CONTENT_TYPE = "Content-Type"
  }
}
