package com.gruent.runtime

import com.gruent.runtime.invocations.InboundMessage
import com.gruent.runtime.invocations.InMemoryMessageBus
import com.gruent.runtime.invocations.Invocation
import com.gruent.runtime.invocations.InvocationJson
import com.gruent.runtime.invocations.InvocationMetadata
import com.gruent.runtime.invocations.Reply
import com.gruent.runtime.invocations.ReplyPolicy
import com.gruent.steps.api.ExecutionContext
import com.gruent.steps.api.MessageStep
import com.gruent.steps.api.StepMessage
import kotlinx.coroutines.CompletableDeferred
import com.gruent.runtime.telemetry.ExecutionStatus
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.time.Duration
import java.time.Instant
import java.util.Collections

class ChannelWorkerTest {
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
  private val bus = InMemoryMessageBus(scope)
  private val telemetry = RecordingTelemetry()

  @AfterEach
  fun tearDown() = scope.cancel()

  /** Holds executions that reach the "gate" step until it completes. */
  private val gate = CompletableDeferred<Unit>()
  private val registry = testRegistry(
    testFactory("gate") {
      object : MessageStep() {
        override suspend fun process(message: StepMessage, context: ExecutionContext, emit: suspend (StepMessage) -> Unit) {
          gate.await()
        }
      }
    },
  )

  /** A started worker. Its timer fires once a year, so tests deliver invocations themselves. */
  private fun worker(json: String = timerToLogPlanJson(cron = "@yearly")) =
    ChannelWorker(timerToLogPlan(json), PLAN_VERSION, registry, bus, telemetry).also { it.start(scope) }

  private fun invocation(planVersion: String = PLAN_VERSION, reply: ReplyPolicy? = null) = Invocation(
    id = "inv-${System.nanoTime()}",
    metadata = InvocationMetadata("org1", "space1", CHANNEL_ID),
    planVersion = planVersion,
    bindingId = "timer-timer",
    stepId = "timer",
    trigger = "timer",
    receivedAt = Instant.now(),
    reply = reply,
  )

  private fun message(invocation: Invocation, replies: MutableList<Reply>? = null): InboundMessage {
    val reply: (suspend (ByteArray) -> Unit)? =
      if (replies == null) null else { data -> replies += InvocationJson.decodeFromString(Reply.serializer(), data.decodeToString()) }
    return InboundMessage("gruent.v1.invocations.$CHANNEL_ID", InvocationJson.encodeToString(Invocation.serializer(), invocation).toByteArray(), reply)
  }

  @Test
  fun `the timer binding publishes invocations that run the channel`() = runBlocking {
    val worker = worker(timerToLogPlanJson(cron = "@every 1s"))
    withTimeout(5_000) {
      while (telemetry.executions.size < 2) delay(50)
    }
    worker.stop(Duration.ofSeconds(5))

    assertTrue(telemetry.executions.all { it.second == ExecutionStatus.COMPLETED })
    assertTrue(telemetry.logs.any { it.stepId == "log" && it.message == "Tick" })
  }

  @Test
  fun `invocations for another plan version are rejected`() = runBlocking {
    val worker = worker()
    assertNull(worker.handle(message(invocation(planVersion = "sha256:old"))))
    assertTrue(telemetry.executions.isEmpty())
  }

  @Test
  fun `work beyond the concurrency limits overflows`() = runBlocking {
    val worker = worker(
      timerToLogPlanJson(cron = "@yearly", maxConcurrent = 1, maxQueued = 0, extraSteps = processingStepJson("gate", "gate"), extraEdges = edgeJson("timer", "gate")),
    )
    val replies = Collections.synchronizedList(mutableListOf<Reply>())
    // The first execution holds the only slot until the gate opens.
    val first = worker.handle(message(invocation(reply = ReplyPolicy(ReplyPolicy.MODE_SYNC, 1000)), replies))
    val second = worker.handle(message(invocation(reply = ReplyPolicy(ReplyPolicy.MODE_SYNC, 1000)), replies))
    assertNotNull(first)
    assertNull(second)
    gate.complete(Unit)
    first!!.join()

    assertEquals(listOf(Reply(overflow = true), Reply(status = 200)), replies)
  }

  @Test
  fun `async invocations are answered on admission`() = runBlocking {
    val worker = worker()
    gate.complete(Unit)
    val replies = Collections.synchronizedList(mutableListOf<Reply>())
    val job = worker.handle(message(invocation(reply = ReplyPolicy(ReplyPolicy.MODE_ASYNC, 1000)), replies))
    job!!.join()
    assertEquals(listOf(Reply()), replies)
    assertEquals(1, telemetry.executions.size)
  }
}
