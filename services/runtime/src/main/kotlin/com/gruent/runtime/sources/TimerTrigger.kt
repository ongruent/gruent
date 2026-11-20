package com.gruent.runtime.sources

import com.gruent.runtime.invocations.Invocation
import com.gruent.runtime.invocations.InvocationMetadata
import com.gruent.runtime.plan.Metadata
import com.gruent.runtime.plan.TimerBinding
import com.gruent.steps.api.Trigger
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import org.slf4j.LoggerFactory
import java.security.SecureRandom
import java.time.Clock
import java.time.Duration
import java.time.Instant

/**
 * Fires a plan's timer binding: on every tick of its cron schedule, it publishes a timer invocation
 * (`routing.TimerInvocation`) to the binding's subject, exactly as a source service would. The runtime
 * then consumes the invocation like any other, so the timer path exercises the same admission, overflow
 * (skip) and execution as HTTP and queue sources.
 *
 * This is the scheduling half of the legacy timer node. It runs in the runtime worker until a dedicated
 * source service schedules timers from the routing table; see the runtime README.
 */
class TimerTrigger(
  private val binding: TimerBinding,
  private val metadata: Metadata,
  private val planVersion: String,
  private val publish: (subject: String, invocation: Invocation) -> Unit,
  private val clock: Clock = Clock.systemUTC(),
  private val sleep: suspend (Duration) -> Unit = { delay(it.toMillis().coerceAtLeast(0)) },
) {
  private val schedule: Schedule = CronSchedule.parse(binding.cronExpression)
  private val log = LoggerFactory.getLogger(TimerTrigger::class.java)

  fun start(scope: CoroutineScope): Job = scope.launch {
    var last = clock.instant()
    while (isActive) {
      val next = schedule.next(last)
      if (next == null) {
        log.warn("Timer {} ({}) has no further ticks", binding.bindingId, binding.cronExpression)
        return@launch
      }
      sleep(Duration.between(clock.instant(), next))
      last = next
      fire(next)
    }
  }

  internal fun fire(firedAt: Instant) {
    val invocation = Invocation(
      id = newInvocationId(),
      metadata = InvocationMetadata(metadata.orgId, metadata.spaceId, metadata.channelId, metadata.channelName.ifEmpty { null }),
      planVersion = planVersion,
      bindingId = binding.bindingId,
      stepId = binding.stepId,
      trigger = Trigger.TYPE_TIMER,
      receivedAt = firedAt,
    )
    try {
      publish(binding.subject, invocation)
    } catch (e: Exception) {
      // Like an overflow, a tick that can't be delivered is skipped.
      log.warn("Timer {} skipped the tick at {}: {}", binding.bindingId, firedAt, e.message)
    }
  }

  companion object {
    private val random = SecureRandom()

    /** A random 128-bit hex ID, like routing.NewInvocationID. */
    fun newInvocationId(): String {
      val bytes = ByteArray(16)
      random.nextBytes(bytes)
      return bytes.joinToString("") { "%02x".format(it) }
    }
  }
}
