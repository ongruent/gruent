package com.gruent.steps.api

import kotlinx.coroutines.channels.ReceiveChannel
import kotlinx.coroutines.channels.SendChannel
import java.time.Instant

/**
 * The contract between the runtime and step implementations (contract v1 of the step library).
 *
 * A runtime loads one [StepFactory] per step library definition (`pluginType` + `pluginVersion`), checks
 * that its [StepFactory.definitionDigest] matches the digest pinned in the plan, and creates one [Step]
 * instance per plan step when it applies the plan. The instance lives as long as the plan version is
 * served, so it can hold resources such as connections, and [Step.close] releases them.
 *
 * Every execution of the channel runs each step once, as a coroutine: the runtime connects the steps with
 * Kotlin channels along the plan's edges and calls [Step.execute] with the step's input and output
 * channels. The input channel is closed once every upstream step has finished; the runtime closes the
 * output channel when [Step.execute] returns. An execution is complete when every step has returned.
 */
interface Step {
  /**
   * Runs the step for one execution. Read [input] until it is closed and send results to [output].
   * Throwing fails the execution; the runtime cancels the other steps of the execution.
   */
  suspend fun execute(input: ReceiveChannel<StepMessage>, output: SendChannel<StepMessage>, context: ExecutionContext)

  /** Releases the step's resources when the runtime stops serving the plan version. */
  suspend fun close() {}
}

/**
 * A step that handles each input message independently. Most processing, conditional and action steps
 * are message steps.
 */
abstract class MessageStep : Step {
  /** Handles one message. Call [emit] for every output message, or not at all to send nothing downstream. */
  abstract suspend fun process(message: StepMessage, context: ExecutionContext, emit: suspend (StepMessage) -> Unit)

  final override suspend fun execute(
    input: ReceiveChannel<StepMessage>,
    output: SendChannel<StepMessage>,
    context: ExecutionContext,
  ) {
    for (message in input) {
      process(message, context) { output.send(it) }
    }
  }
}

/**
 * A source step starts executions. Sources are not scheduled inside an execution: the source bindings in
 * the plan (HTTP routes, timer schedules, queue subscriptions) produce invocations, and the runtime asks
 * the source step that the invocation names to turn the trigger into the execution's first message.
 */
abstract class SourceStep : Step {
  /** Returns the first message of an execution started by [trigger]. */
  abstract fun receive(trigger: Trigger, context: ExecutionContext): StepMessage

  /** Sources forward the message from [receive], which the runtime places on their input. */
  override suspend fun execute(
    input: ReceiveChannel<StepMessage>,
    output: SendChannel<StepMessage>,
    context: ExecutionContext,
  ) {
    for (message in input) {
      output.send(message)
    }
  }
}

/** What started an execution. */
data class Trigger(
  /** One of [TYPE_HTTP], [TYPE_TIMER] or [TYPE_MESSAGE_QUEUE]. */
  val type: String,
  val bindingId: String,
  val receivedAt: Instant,
  val contentType: String? = null,
  val payload: ByteArray = ByteArray(0),
) {
  companion object {
    const val TYPE_HTTP = "http"
    const val TYPE_TIMER = "timer"
    const val TYPE_MESSAGE_QUEUE = "message_queue"
  }

  override fun equals(other: Any?): Boolean =
    other is Trigger && type == other.type && bindingId == other.bindingId && receivedAt == other.receivedAt &&
      contentType == other.contentType && payload.contentEquals(other.payload)

  override fun hashCode(): Int = listOf(type, bindingId, receivedAt, contentType, payload.contentHashCode()).hashCode()
}

/**
 * A message that flows along an edge within one execution.
 *
 * A [Kind.SIGNAL] carries no data (for example a timer tick). A [Kind.DATA] message carries [payload] bytes,
 * described by [contentType] when known.
 */
class StepMessage private constructor(
  val kind: Kind,
  val payload: ByteArray,
  val contentType: String?,
) {
  enum class Kind { SIGNAL, DATA }

  companion object {
    private val SIGNAL = StepMessage(Kind.SIGNAL, ByteArray(0), null)

    fun signal(): StepMessage = SIGNAL

    fun data(payload: ByteArray, contentType: String? = null): StepMessage = StepMessage(Kind.DATA, payload, contentType)
  }

  override fun toString(): String = "StepMessage(kind=$kind, contentType=$contentType, bytes=${payload.size})"
}

/** The execution a step runs in. */
interface ExecutionContext {
  val executionId: String
  val channelId: String
  val planVersion: String
  val trigger: Trigger

  /** Records entries in the channel's execution logs, attributed to the current step. */
  val logger: ExecutionLogger
}

enum class LogLevel { DEBUG, INFO, WARN, ERROR }

/** Records execution log entries. Entries are correlated with the execution and the step that wrote them. */
fun interface ExecutionLogger {
  fun log(level: LogLevel, message: String, attributes: Map<String, String>)
}

/** Categories of the step library (`category` in step.json). */
enum class StepCategory(val value: String) {
  SOURCE("source"),
  PROCESSING("processing"),
  ACTION("action"),
  CONDITIONAL("conditional"),
  CUSTOM("custom"),
}

/**
 * Values that a step needs from the plan step.
 *
 * [configJson] is the step's configuration as JSON, exactly as validated by the controller. Factories
 * validate and decode it again with the generated configuration type, so a plan for a different
 * definition is rejected rather than misread.
 */
data class StepSpec(
  val stepId: String,
  val name: String,
  val pluginType: String,
  val pluginVersion: Int,
  val configJson: String,
  val redaction: Redaction? = null,
)

/**
 * Input fields that a step must redact before the input leaves the runtime, for example in logs. Paths use
 * variable syntax relative to the input (`card.number`, `readings[].token`).
 */
data class Redaction(val paths: List<String>, val replacement: String)

/** Thrown by [StepFactory.create] when a step's configuration is invalid. */
class StepConfigurationException(message: String, cause: Throwable? = null) : Exception(message, cause)

/**
 * Creates the steps of one step library definition. Factories are discovered with [java.util.ServiceLoader]
 * (`META-INF/services/com.gruent.steps.api.StepFactory`).
 */
interface StepFactory {
  val pluginType: String
  val pluginVersion: Int

  /** Digest of the step.json the implementation was built against (see the generated configuration type). */
  val definitionDigest: String
  val category: StepCategory

  /** Creates a step. Throws [StepConfigurationException] if the configuration is invalid. */
  fun create(spec: StepSpec): Step
}
