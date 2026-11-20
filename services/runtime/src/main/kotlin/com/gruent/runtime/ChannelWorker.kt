package com.gruent.runtime

import com.gruent.runtime.execution.Admission
import com.gruent.runtime.execution.ChannelGraph
import com.gruent.runtime.execution.ExecutionRequest
import com.gruent.runtime.execution.ExecutionResult
import com.gruent.runtime.execution.Executor
import com.gruent.runtime.invocations.InboundMessage
import com.gruent.runtime.invocations.Invocation
import com.gruent.runtime.invocations.InvocationJson
import com.gruent.runtime.invocations.MessageBus
import com.gruent.runtime.invocations.Reply
import com.gruent.runtime.invocations.ReplyPolicy
import com.gruent.runtime.invocations.Subscription
import com.gruent.runtime.plan.Plan
import com.gruent.runtime.sources.TimerTrigger
import com.gruent.runtime.steps.StepRegistry
import com.gruent.runtime.telemetry.ExecutionStatus
import com.gruent.runtime.telemetry.ExecutionTelemetry
import com.gruent.steps.api.Trigger
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.joinAll
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import org.slf4j.LoggerFactory
import java.time.Clock
import java.time.Duration
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Serves one plan version of a channel:
 *
 * 1. Applying the plan builds the [ChannelGraph], which creates every step. A plan that can't be applied
 *    throws, and the runtime reports the failure.
 * 2. [start] subscribes to the channel's invocation subject in the queue group `runtime.<channel ID>`, so
 *    replicas share the work, and starts the plan's timer bindings ([TimerTrigger]).
 * 3. Each invocation is checked (channel, plan version, binding), admitted ([Admission]) or rejected as
 *    overflow, executed ([Executor]) and, if the source waits, answered with a [Reply].
 * 4. [stop] stops admitting work, lets in-flight executions finish (the `replace` publish strategy), and
 *    closes the steps.
 */
class ChannelWorker(
  val plan: Plan,
  val planVersion: String,
  registry: StepRegistry,
  private val bus: MessageBus,
  telemetry: ExecutionTelemetry,
  private val clock: Clock = Clock.systemUTC(),
) {
  private val log = LoggerFactory.getLogger(ChannelWorker::class.java)
  private val channelId = plan.metadata.channelId
  private val graph = ChannelGraph.build(plan, registry)
  private val admission = plan.policies.runtime.concurrency.let { Admission(it.maxConcurrentExecutions, it.maxQueuedExecutions) }
  private val executor = Executor(graph, channelId, planVersion, telemetry, plan.policies.runtime.timeouts.maxInvocationMs)

  /** Source step and trigger type of every binding, by binding ID. */
  private val bindings: Map<String, Pair<String, String>> = buildMap {
    plan.bindings.http.forEach { put(it.bindingId, it.stepId to Trigger.TYPE_HTTP) }
    plan.bindings.timer.forEach { put(it.bindingId, it.stepId to Trigger.TYPE_TIMER) }
    plan.bindings.messageQueue.forEach { put(it.bindingId, it.stepId to Trigger.TYPE_MESSAGE_QUEUE) }
  }
  private val subjects: Set<String> = buildSet {
    plan.bindings.http.forEach { add(it.subject) }
    plan.bindings.timer.forEach { add(it.subject) }
    plan.bindings.messageQueue.forEach { add(it.subject) }
  }

  private val accepting = AtomicBoolean(false)
  private val workScope = CoroutineScope(SupervisorJob())
  private val subscriptions = mutableListOf<Subscription>()
  private val timers = mutableListOf<Job>()

  init {
    for ((bindingId, binding) in bindings) {
      if (graph.source(binding.first) == null) {
        throw IllegalArgumentException("binding $bindingId starts step ${binding.first}, which is not a source step of the plan")
      }
    }
  }

  fun start(triggerScope: CoroutineScope) {
    accepting.set(true)
    for (subject in subjects) {
      subscriptions += bus.subscribe(subject, queueGroup(channelId)) { handle(it) }
    }
    for (binding in plan.bindings.timer) {
      val trigger = TimerTrigger(binding, plan.metadata, planVersion, { subject, invocation ->
        bus.publish(subject, InvocationJson.encodeToString(Invocation.serializer(), invocation).toByteArray())
      }, clock)
      timers += trigger.start(triggerScope)
    }
    if (plan.bindings.http.isNotEmpty() || plan.bindings.messageQueue.isNotEmpty()) {
      log.warn("Channel {} has HTTP or message queue bindings; they run once a source service publishes their invocations", channelId)
    }
    log.info(
      "Serving channel {} at plan version {} (subjects {}, {} timer(s), {} concurrent / {} queued executions)",
      channelId, planVersion, subjects, plan.bindings.timer.size, admission.maxConcurrent, admission.maxQueued,
    )
  }

  /** Handles one invocation message. Returns the admitted execution, or null if it was rejected. */
  internal suspend fun handle(message: InboundMessage): Job? {
    val invocation = try {
      InvocationJson.decodeFromString(Invocation.serializer(), message.data.decodeToString())
    } catch (e: Exception) {
      log.warn("Discarding a message on {} that is not an invocation: {}", message.subject, e.message)
      return null
    }
    val rejection = when {
      invocation.kind != Invocation.KIND -> "kind ${invocation.kind} is not an invocation"
      invocation.metadata.channelId != channelId -> "it is for channel ${invocation.metadata.channelId}"
      invocation.planVersion != planVersion -> "it is for plan version ${invocation.planVersion}, not $planVersion"
      bindings[invocation.bindingId]?.first != invocation.stepId -> "binding ${invocation.bindingId} does not start step ${invocation.stepId}"
      bindings[invocation.bindingId]?.second != invocation.trigger -> "binding ${invocation.bindingId} is not a ${invocation.trigger} binding"
      else -> null
    }
    if (rejection != null) {
      // Not this version's work: a source that hasn't reconciled the new routing yet, or a replica of the
      // previous version. Sources waiting for a reply time out.
      log.info("Rejecting invocation {}: {}", invocation.id, rejection)
      return null
    }
    if (!accepting.get() || !admission.tryAdmit()) {
      log.info("Channel {} is at capacity; invocation {} ({}) overflows", channelId, invocation.id, invocation.trigger)
      reply(message, invocation, Reply(overflow = true))
      return null
    }
    if (invocation.reply?.mode == ReplyPolicy.MODE_ASYNC) {
      reply(message, invocation, Reply())
    }
    return workScope.launch {
      val result = admission.run { execute(invocation) }
      if (invocation.reply?.mode == ReplyPolicy.MODE_SYNC) {
        reply(message, invocation, syncReply(result))
      }
    }
  }

  private suspend fun execute(invocation: Invocation): ExecutionResult {
    val result = executor.execute(
      ExecutionRequest(
        invocationId = invocation.id,
        sourceStepId = invocation.stepId,
        trigger = Trigger(
          type = invocation.trigger,
          bindingId = invocation.bindingId,
          receivedAt = invocation.receivedAt,
          contentType = invocation.contentType,
          payload = invocation.payload ?: ByteArray(0),
        ),
      ),
    )
    if (result.status == ExecutionStatus.COMPLETED) {
      log.debug("Execution {} of invocation {} completed", result.executionId, invocation.id)
    } else {
      log.warn("Execution {} of invocation {} {}: {}", result.executionId, invocation.id, result.status.value, result.error?.message)
    }
    return result
  }

  /**
   * The reply to a sync HTTP invocation. Response steps don't exist yet, so a completed execution answers
   * 200 with no body.
   */
  private fun syncReply(result: ExecutionResult): Reply = when (result.status) {
    ExecutionStatus.COMPLETED -> Reply(status = 200)
    ExecutionStatus.TIMEOUT -> Reply(status = 504)
    else -> Reply(status = 500)
  }

  private suspend fun reply(message: InboundMessage, invocation: Invocation, reply: Reply) {
    val respond = message.reply ?: return
    if (invocation.reply == null) return
    try {
      respond(InvocationJson.encodeToString(Reply.serializer(), reply).toByteArray())
    } catch (e: Exception) {
      log.warn("Could not reply to invocation {}: {}", invocation.id, e.message)
    }
  }

  /**
   * Stops admitting work, stops the timers, waits up to [gracePeriod] for in-flight executions, and closes
   * the steps.
   */
  suspend fun stop(gracePeriod: Duration) {
    accepting.set(false)
    subscriptions.forEach { runCatching { it.unsubscribe() } }
    subscriptions.clear()
    timers.forEach { it.cancelAndJoin() }
    timers.clear()
    val inFlight = workScope.coroutineContext[Job]!!.children.toList()
    if (inFlight.isNotEmpty()) {
      log.info("Waiting for {} in-flight execution(s) of channel {}", inFlight.size, channelId)
    }
    val drained = withTimeoutOrNull(gracePeriod.toMillis()) { inFlight.joinAll() }
    if (drained == null) {
      log.warn("Cancelling executions of channel {} that did not finish within {}", channelId, gracePeriod)
      workScope.coroutineContext[Job]!!.cancelAndJoin()
    }
    graph.close()
    log.info("Stopped serving channel {} at plan version {}", channelId, planVersion)
  }

  companion object {
    fun queueGroup(channelId: String) = "runtime.$channelId"
  }
}
