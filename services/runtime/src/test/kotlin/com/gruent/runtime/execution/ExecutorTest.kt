package com.gruent.runtime.execution

import com.gruent.runtime.CHANNEL_ID
import com.gruent.runtime.PLAN_VERSION
import com.gruent.runtime.RecordingTelemetry
import com.gruent.runtime.edgeJson
import com.gruent.runtime.processingStepJson
import com.gruent.runtime.testFactory
import com.gruent.runtime.testRegistry
import com.gruent.runtime.steps.UnsupportedStepException
import com.gruent.runtime.telemetry.ExecutionStatus
import com.gruent.runtime.timerToLogPlan
import com.gruent.runtime.timerToLogPlanJson
import com.gruent.steps.api.ExecutionContext
import com.gruent.steps.api.LogLevel
import com.gruent.steps.api.MessageStep
import com.gruent.steps.api.StepMessage
import com.gruent.steps.api.Trigger
import kotlinx.coroutines.delay
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import java.time.Instant

/** Emits "a" and "b" for every input. */
private class SplitStep : MessageStep() {
  override suspend fun process(message: StepMessage, context: ExecutionContext, emit: suspend (StepMessage) -> Unit) {
    emit(StepMessage.data("a".toByteArray()))
    emit(StepMessage.data("b".toByteArray()))
  }
}

private class FailStep : MessageStep() {
  override suspend fun process(message: StepMessage, context: ExecutionContext, emit: suspend (StepMessage) -> Unit) {
    error("boom")
  }
}

private class SlowStep : MessageStep() {
  override suspend fun process(message: StepMessage, context: ExecutionContext, emit: suspend (StepMessage) -> Unit) {
    delay(10_000)
  }
}

class ExecutorTest {
  private val registry = testRegistry(testFactory("split") { SplitStep() }, testFactory("fail") { FailStep() }, testFactory("slow") { SlowStep() })

  private val tick = ExecutionRequest("inv1", "timer", Trigger(Trigger.TYPE_TIMER, "timer-timer", Instant.parse("2026-11-20T10:00:00Z")))

  private fun executor(json: String, telemetry: RecordingTelemetry, timeoutMs: Long = 0) =
    Executor(ChannelGraph.build(timerToLogPlan(json), registry), CHANNEL_ID, PLAN_VERSION, telemetry, timeoutMs)

  @Test
  fun `a timer tick runs the connected log step`() = runTest {
    val telemetry = RecordingTelemetry()
    val result = executor(timerToLogPlanJson(), telemetry).execute(tick)

    assertEquals(ExecutionStatus.COMPLETED, result.status)
    assertEquals(listOf(result.executionId to ExecutionStatus.COMPLETED), telemetry.executions)
    assertEquals(listOf("timer" to "Timer triggered", "log" to "Tick"), telemetry.logs.map { it.stepId to it.message })
    assertEquals(LogLevel.INFO, telemetry.logs.last().level)
    assertEquals("signal", telemetry.logs.last().attributes["input"])
    assertEquals(setOf("timer", "log"), telemetry.steps.map { it.second }.toSet())
  }

  @Test
  fun `outputs fan out to every downstream step and fan in`() = runTest {
    // timer -> log, timer -> split -> log2, split -> log2 (two edges between the same steps deliver twice)
    val json = timerToLogPlanJson(
      extraSteps = processingStepJson("split", "split") +
        """,{"id":"log2","type":"action.log","name":"Log 2","definition":{"pluginType":"log","pluginVersion":1,"digest":"${com.gruent.steps.plugins.log.v1.LogConfig.definitionDigest}"},"config":{"level":"warn"}}""",
      extraEdges = edgeJson("timer", "split") + edgeJson("split", "log2"),
    )
    val telemetry = RecordingTelemetry()
    val result = executor(json, telemetry).execute(tick)

    assertEquals(ExecutionStatus.COMPLETED, result.status)
    assertEquals(1, telemetry.logs.count { it.stepId == "log" })
    assertEquals(listOf("a", "b"), telemetry.logs.filter { it.stepId == "log2" }.map { it.attributes["data"] })
  }

  @Test
  fun `a failing step fails the execution`() = runTest {
    val json = timerToLogPlanJson(extraSteps = processingStepJson("fail", "fail"), extraEdges = edgeJson("timer", "fail"))
    val telemetry = RecordingTelemetry()
    val result = executor(json, telemetry).execute(tick)

    assertEquals(ExecutionStatus.FAILED, result.status)
    assertTrue(result.error is StepFailedException)
    assertEquals(listOf(result.executionId to ExecutionStatus.FAILED), telemetry.executions)
  }

  @Test
  fun `executions are bounded by the invocation timeout`() = runTest {
    val json = timerToLogPlanJson(extraSteps = processingStepJson("slow", "slow"), extraEdges = edgeJson("timer", "slow"))
    val result = executor(json, RecordingTelemetry(), timeoutMs = 100).execute(tick)

    assertEquals(ExecutionStatus.TIMEOUT, result.status)
  }

  @Test
  fun `graphs with cycles or unknown steps are rejected`() {
    val cycle = timerToLogPlanJson(
      extraSteps = processingStepJson("a", "split") + processingStepJson("b", "split"),
      extraEdges = edgeJson("a", "b") + edgeJson("b", "a"),
    )
    assertThrows<InvalidGraphException> { ChannelGraph.build(timerToLogPlan(cycle), registry) }

    val dangling = timerToLogPlanJson(extraEdges = edgeJson("log", "missing"))
    assertThrows<InvalidGraphException> { ChannelGraph.build(timerToLogPlan(dangling), registry) }

    val intoSource = timerToLogPlanJson(extraEdges = edgeJson("log", "timer"))
    assertThrows<InvalidGraphException> { ChannelGraph.build(timerToLogPlan(intoSource), registry) }
  }

  @Test
  fun `steps must match the pinned definition digest`() {
    val json = timerToLogPlanJson(logDigest = "sha256:other")
    val error = assertThrows<UnsupportedStepException> { ChannelGraph.build(timerToLogPlan(json), registry) }
    assertTrue(error.message!!.contains("digest"))
  }
}
