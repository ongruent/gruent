package com.gruent.steps.plugins.compare.v1

import com.gruent.steps.api.ExecutionContext
import com.gruent.steps.api.ExecutionLogger
import com.gruent.steps.api.StepConfigurationException
import com.gruent.steps.api.StepMessage
import com.gruent.steps.api.StepSpec
import com.gruent.steps.api.Trigger
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.CsvSource
import java.time.Instant

class CompareStepTest {
  private val context = object : ExecutionContext {
    override val executionId = "e1"
    override val channelId = "c1"
    override val planVersion = "sha256:1"
    override val trigger = Trigger(Trigger.TYPE_HTTP, "b1", Instant.EPOCH)
    override val logger = ExecutionLogger { _, _, _ -> }
  }

  private fun step(config: String) = CompareStepFactory().create(StepSpec("cmp", "Compare", "compare", 1, config)) as CompareStep

  private fun fixed(type: String, left: String, operator: String, value: String) =
    step("""{"valueType":"$type","left":"$left","operator":"$operator","compareTo":"value","value":"$value"}""")

  private suspend fun route(step: CompareStep, input: String): String? {
    var port: String? = null
    step.process(StepMessage.data(input.toByteArray()), context) { port = it.port }
    return port
  }

  @ParameterizedTest
  @CsvSource(
    "equal, 25, success", "equal, 25.0, success", "equal, 26, failure",
    "notEqual, 26, success", "greaterThan, 24.5, success", "greaterThan, 25, failure",
    "greaterThanOrEqual, 25, success", "lessThan, 25.01, success", "lessThan, 25, failure",
    "lessThanOrEqual, 25, success", "lessThanOrEqual, 24, failure",
  )
  fun `numbers compare numerically`(operator: String, value: String, expected: String) = runTest {
    assertEquals(expected, route(fixed("number", "input.reading.temperatureC", operator, value), """{"reading":{"temperatureC":25}}"""))
  }

  @Test
  fun `text and booleans compare by equality`() = runTest {
    assertEquals("success", route(fixed("string", "input.status", "equal", "ok"), """{"status":"ok"}"""))
    assertEquals("failure", route(fixed("string", "input.status", "equal", "OK"), """{"status":"ok"}"""))
    assertEquals("success", route(fixed("boolean", "input.active", "notEqual", "false"), """{"active":true}"""))
    assertEquals("success", route(fixed("string", "input", "equal", "ok"), "\"ok\""))
  }

  @Test
  fun `another input value`() = runTest {
    val step = step("""{"valueType":"number","left":"input.temperatureC","operator":"greaterThan","compareTo":"variable","right":"input.limits.maxC"}""")
    assertEquals("success", route(step, """{"temperatureC":30,"limits":{"maxC":25}}"""))
    assertEquals("failure", route(step, """{"temperatureC":20,"limits":{"maxC":25}}"""))
    assertEquals("failure", route(step, """{"temperatureC":30}"""))
  }

  @Test
  fun `missing, mistyped and multi-valued inputs fail the condition`() = runTest {
    val step = fixed("number", "input.temperatureC", "equal", "25")
    assertEquals("failure", route(step, """{}"""))
    assertEquals("failure", route(step, """{"temperatureC":"25"}"""))
    assertEquals("failure", route(step, """{"temperatureC":null}"""))
    assertEquals("failure", route(step, "not json"))
    assertEquals("failure", route(fixed("number", "input.readings[].value", "equal", "1"), """{"readings":[{"value":1},{"value":1}]}"""))
  }

  @Test
  fun `invalid configurations are rejected`() {
    assertThrows<StepConfigurationException> { fixed("number", "input.x", "equal", "warm") }
    assertThrows<StepConfigurationException> { fixed("string", "input.x", "greaterThan", "a") }
    assertThrows<StepConfigurationException> { step("""{"valueType":"number","left":"input.x","operator":"equal","compareTo":"value"}""") }
    assertThrows<StepConfigurationException> { step("""{"valueType":"number","left":"input.x","operator":"equal","compareTo":"variable"}""") }
  }
}
