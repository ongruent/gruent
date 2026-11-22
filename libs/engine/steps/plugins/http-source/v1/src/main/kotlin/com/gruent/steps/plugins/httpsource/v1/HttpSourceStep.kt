package com.gruent.steps.plugins.httpsource.v1

import com.gruent.steps.api.ExecutionContext
import com.gruent.steps.api.LogLevel
import com.gruent.steps.api.SourceStep
import com.gruent.steps.api.Step
import com.gruent.steps.api.StepCategory
import com.gruent.steps.api.StepConfigurationException
import com.gruent.steps.api.StepFactory
import com.gruent.steps.api.StepMessage
import com.gruent.steps.api.StepSpec
import com.gruent.steps.api.Trigger
import com.gruent.steps.config.ConfigValidationException

/** Creates `http-source@1` steps. */
class HttpSourceStepFactory : StepFactory {
  override val pluginType: String = HttpSourceConfig.pluginType
  override val pluginVersion: Int = HttpSourceConfig.pluginVersion
  override val definitionDigest: String = HttpSourceConfig.definitionDigest
  override val category: StepCategory = StepCategory.SOURCE

  override fun create(spec: StepSpec): Step {
    val config = try {
      HttpSourceConfig.decode(spec.configJson)
    } catch (e: ConfigValidationException) {
      throw StepConfigurationException("invalid configuration for step ${spec.stepId}: ${e.message}", e)
    }
    return HttpSourceStep(config)
  }
}

/**
 * Starts an execution with the body of an HTTP request (ported from the legacy HTTP source node, which
 * forwarded the request body as bytes).
 *
 * The legacy node ran its own server. Here the route, method, response mode and timeout are the plan's
 * HTTP binding, which the controller compiles from [HttpSourceConfig]: the ingress (`routing.Ingress`)
 * matches the request, publishes the invocation and waits for the runtime's reply, which an
 * `http-response` step sets. The step itself only turns the request into the first message: the body
 * with the request's content type, or a signal for a request without a body (e.g. GET).
 *
 * The runtime doesn't enforce payload types yet, so a body that doesn't match the request model is
 * passed on as is; downstream steps that parse JSON treat it as invalid input.
 */
class HttpSourceStep(val config: HttpSourceConfig) : SourceStep() {
  override fun receive(trigger: Trigger, context: ExecutionContext): StepMessage {
    context.logger.log(
      LogLevel.INFO,
      "Request received",
      buildMap {
        put("method", config.method.value)
        put("bytes", trigger.payload.size.toString())
        trigger.contentType?.let { put("contentType", it) }
      },
    )
    if (trigger.payload.isEmpty()) return StepMessage.signal()
    return StepMessage.data(trigger.payload, trigger.contentType?.takeIf { it.isNotBlank() })
  }
}
