package com.gruent.runtime.telemetry

import com.gruent.steps.api.ExecutionLogger
import com.gruent.steps.api.LogLevel
import io.opentelemetry.api.OpenTelemetry
import io.opentelemetry.api.common.AttributeKey
import io.opentelemetry.api.common.Attributes
import io.opentelemetry.api.logs.Logger
import io.opentelemetry.api.logs.Severity
import io.opentelemetry.api.trace.Span
import io.opentelemetry.api.trace.SpanKind
import io.opentelemetry.api.trace.StatusCode
import io.opentelemetry.api.trace.Tracer
import io.opentelemetry.context.Context
import java.time.Instant

/**
 * Attributes of channel execution telemetry. Channel executions share the platform's OTel collector and
 * ClickHouse tables with every other service; these attributes tell them apart, and the API filters on
 * them (see services/http-api/api/v1/channels/executions).
 *
 * Resource attributes (every span and log of a runtime worker):
 * - [WORKLOAD] = [WORKLOAD_CHANNEL]
 * - [ORG_ID], [SPACE_ID], [CHANNEL_ID]
 *
 * Span and log attributes: [EXECUTION_ID], [PLAN_VERSION], [INVOCATION_ID], [TRIGGER], [BINDING_ID], and on
 * step spans and logs [STEP_ID], [STEP_NAME], [STEP_TYPE]. The execution span ([EXECUTION_SPAN_NAME]) and
 * the execution's final log entry carry [EXECUTION_STATUS].
 */
object TelemetryAttributes {
  const val WORKLOAD = "gruent.workload"
  const val WORKLOAD_CHANNEL = "channel"
  const val ORG_ID = "gruent.org.id"
  const val SPACE_ID = "gruent.space.id"
  const val CHANNEL_ID = "gruent.channel.id"

  const val EXECUTION_ID = "gruent.execution.id"
  const val EXECUTION_STATUS = "gruent.execution.status"
  const val PLAN_VERSION = "gruent.plan.version"
  const val INVOCATION_ID = "gruent.invocation.id"
  const val TRIGGER = "gruent.trigger"
  const val BINDING_ID = "gruent.binding.id"
  const val STEP_ID = "gruent.step.id"
  const val STEP_NAME = "gruent.step.name"
  const val STEP_TYPE = "gruent.step.type"

  const val EXECUTION_SPAN_NAME = "channel.execution"
  const val STEP_SPAN_NAME = "channel.step"
}

/** Final state of an execution. */
enum class ExecutionStatus(val value: String) {
  COMPLETED("completed"),
  FAILED("failed"),
  TIMEOUT("timeout"),
  CANCELLED("cancelled"),
}

/** Identifies an execution for telemetry. */
data class ExecutionInfo(
  val channelId: String,
  val planVersion: String,
  val invocationId: String,
  val trigger: String,
  val bindingId: String,
  val receivedAt: Instant,
)

/** Records the telemetry of channel executions. */
interface ExecutionTelemetry {
  fun startExecution(info: ExecutionInfo): ExecutionRecorder
}

/** The telemetry of one execution. */
interface ExecutionRecorder {
  /** The execution ID: the trace ID of the execution, which the API lists executions by. */
  val executionId: String

  fun startStep(stepId: String, stepName: String, stepType: String): StepRecorder

  fun end(status: ExecutionStatus, error: Throwable? = null)
}

interface StepRecorder {
  val logger: ExecutionLogger

  fun end(error: Throwable? = null)
}

/** Records executions as OTel traces (one span per execution and per step) and logs. */
class OtelExecutionTelemetry(openTelemetry: OpenTelemetry) : ExecutionTelemetry {
  private val tracer: Tracer = openTelemetry.getTracer("com.gruent.runtime")
  private val logs: Logger = openTelemetry.logsBridge.get("com.gruent.runtime")

  override fun startExecution(info: ExecutionInfo): ExecutionRecorder {
    val span = tracer.spanBuilder(TelemetryAttributes.EXECUTION_SPAN_NAME)
      .setSpanKind(SpanKind.CONSUMER)
      .setNoParent()
      .setAttribute(TelemetryAttributes.PLAN_VERSION, info.planVersion)
      .setAttribute(TelemetryAttributes.INVOCATION_ID, info.invocationId)
      .setAttribute(TelemetryAttributes.TRIGGER, info.trigger)
      .setAttribute(TelemetryAttributes.BINDING_ID, info.bindingId)
      .startSpan()
    val executionId = span.spanContext.traceId
    span.setAttribute(TelemetryAttributes.EXECUTION_ID, executionId)
    return OtelExecutionRecorder(info, executionId, span)
  }

  private inner class OtelExecutionRecorder(
    private val info: ExecutionInfo,
    override val executionId: String,
    private val span: Span,
  ) : ExecutionRecorder {
    private val context: Context = Context.root().with(span)

    private fun baseAttributes() = Attributes.builder()
      .put(TelemetryAttributes.EXECUTION_ID, executionId)
      .put(TelemetryAttributes.PLAN_VERSION, info.planVersion)
      .put(TelemetryAttributes.INVOCATION_ID, info.invocationId)
      .put(TelemetryAttributes.TRIGGER, info.trigger)

    override fun startStep(stepId: String, stepName: String, stepType: String): StepRecorder {
      val stepSpan = tracer.spanBuilder(TelemetryAttributes.STEP_SPAN_NAME)
        .setParent(context)
        .setSpanKind(SpanKind.INTERNAL)
        .setAttribute(TelemetryAttributes.EXECUTION_ID, executionId)
        .setAttribute(TelemetryAttributes.STEP_ID, stepId)
        .setAttribute(TelemetryAttributes.STEP_NAME, stepName)
        .setAttribute(TelemetryAttributes.STEP_TYPE, stepType)
        .startSpan()
      val stepContext = context.with(stepSpan)
      val logger = ExecutionLogger { level, message, attributes ->
        val builder = baseAttributes()
          .put(TelemetryAttributes.STEP_ID, stepId)
          .put(TelemetryAttributes.STEP_NAME, stepName)
          .put(TelemetryAttributes.STEP_TYPE, stepType)
        attributes.forEach { (key, value) -> builder.put(AttributeKey.stringKey(key), value) }
        emit(stepContext, level, message, builder.build())
      }
      return object : StepRecorder {
        override val logger: ExecutionLogger = logger

        override fun end(error: Throwable?) {
          if (error != null) {
            stepSpan.recordException(error)
            stepSpan.setStatus(StatusCode.ERROR, error.message ?: error.javaClass.simpleName)
          }
          stepSpan.end()
        }
      }
    }

    override fun end(status: ExecutionStatus, error: Throwable?) {
      span.setAttribute(TelemetryAttributes.EXECUTION_STATUS, status.value)
      val attributes = baseAttributes().put(TelemetryAttributes.EXECUTION_STATUS, status.value)
      if (status == ExecutionStatus.COMPLETED) {
        span.setStatus(StatusCode.OK)
        emit(context, LogLevel.INFO, "Execution completed", attributes.build())
      } else {
        error?.let { span.recordException(it) }
        val reason = error?.message ?: status.value
        span.setStatus(StatusCode.ERROR, reason)
        emit(context, LogLevel.ERROR, "Execution ${status.value}: $reason", attributes.build())
      }
      span.end()
    }

    private fun emit(context: Context, level: LogLevel, message: String, attributes: Attributes) {
      logs.logRecordBuilder()
        .setContext(context)
        .setTimestamp(Instant.now())
        .setSeverity(severity(level))
        .setSeverityText(level.name.lowercase())
        .setBody(message)
        .setAllAttributes(attributes)
        .emit()
    }
  }

  companion object {
    fun severity(level: LogLevel): Severity = when (level) {
      LogLevel.DEBUG -> Severity.DEBUG
      LogLevel.INFO -> Severity.INFO
      LogLevel.WARN -> Severity.WARN
      LogLevel.ERROR -> Severity.ERROR
    }
  }
}
