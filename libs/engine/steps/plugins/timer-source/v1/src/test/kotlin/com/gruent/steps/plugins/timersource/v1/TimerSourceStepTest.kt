package com.gruent.steps.plugins.timersource.v1

import com.gruent.steps.api.ExecutionContext
import com.gruent.steps.api.ExecutionLogger
import com.gruent.steps.api.SourceStep
import com.gruent.steps.api.StepConfigurationException
import com.gruent.steps.api.StepMessage
import com.gruent.steps.api.StepSpec
import com.gruent.steps.api.Trigger
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import java.time.Instant

class TimerSourceStepTest {
  private val logged = mutableListOf<String>()
  private val tick = Trigger(Trigger.TYPE_TIMER, "timer-t", Instant.parse("2026-11-20T10:00:00Z"))
  private val context = object : ExecutionContext {
    override val executionId = "e1"
    override val channelId = "c1"
    override val planVersion = "sha256:1"
    override val trigger = tick
    override val logger = ExecutionLogger { _, message, attributes -> logged += "$message ${attributes["firedAt"]}" }
  }

  @Test
  fun `a tick starts the execution with a signal`() {
    val step = TimerSourceStepFactory().create(StepSpec("t", "Timer", "timer-source", 1, """{"cronExpression":"0 */5 * * * *"}""")) as SourceStep
    assertEquals(StepMessage.Kind.SIGNAL, step.receive(tick, context).kind)
    assertEquals(listOf("Timer triggered 2026-11-20T10:00:00Z"), logged)
  }

  @Test
  fun `the configuration is validated`() {
    assertThrows<StepConfigurationException> {
      TimerSourceStepFactory().create(StepSpec("t", "Timer", "timer-source", 1, """{"cronExpression":""}"""))
    }
  }
}
