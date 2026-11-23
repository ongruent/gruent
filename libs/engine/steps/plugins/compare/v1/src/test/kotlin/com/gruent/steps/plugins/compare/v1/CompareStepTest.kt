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

  /** A comparison of [left] with a fixed value, as configured in the editor. */
  private fun fixed(left: String, operator: String, value: String) =
    """{"left":"$left","operator":"$operator","compareTo":"value","value":"$value"}"""

  /** A comparison of [left] with another field. */
  private fun other(left: String, operator: String, right: String) =
    """{"left":"$left","operator":"$operator","compareTo":"variable","right":"$right"}"""

  /** A step with [comparisons] whose compiled value types are [types], as the controller compiles them. */
  private fun step(types: List<String>, vararg comparisons: String, match: String = "all") =
    CompareStepFactory().create(
      StepSpec(
        "cmp", "Compare", "compare", 1,
        """{"modelId":"m1","match":"$match","comparisons":[${comparisons.joinToString(",")}]}""",
        compiledJson = """{"modelRef":"m1","valueTypes":[${types.joinToString(",") { "\"$it\"" }}]}""",
      ),
    ) as CompareStep

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
    val step = step(listOf("number"), fixed("reading.temperatureC", operator, value))
    assertEquals(expected, route(step, """{"reading":{"temperatureC":25}}"""))
  }

  @Test
  fun `text and booleans compare by equality`() = runTest {
    assertEquals("success", route(step(listOf("string"), fixed("status", "equal", "ok")), """{"status":"ok"}"""))
    assertEquals("failure", route(step(listOf("string"), fixed("status", "equal", "OK")), """{"status":"ok"}"""))
    assertEquals("success", route(step(listOf("boolean"), fixed("active", "notEqual", "false")), """{"active":true}"""))
  }

  @Test
  fun `another field`() = runTest {
    val step = step(listOf("number"), other("temperatureC", "greaterThan", "limits.maxC"))
    assertEquals("success", route(step, """{"temperatureC":30,"limits":{"maxC":25}}"""))
    assertEquals("failure", route(step, """{"temperatureC":20,"limits":{"maxC":25}}"""))
    assertEquals("failure", route(step, """{"temperatureC":30}"""))
  }

  @Test
  fun `every comparison must hold with all`() = runTest {
    val step = step(listOf("number", "string"), fixed("temperatureC", "greaterThan", "25"), fixed("status", "equal", "ok"))
    assertEquals("success", route(step, """{"temperatureC":30,"status":"ok"}"""))
    assertEquals("failure", route(step, """{"temperatureC":30,"status":"error"}"""))
    assertEquals("failure", route(step, """{"temperatureC":20,"status":"ok"}"""))
  }

  @Test
  fun `one comparison is enough with any`() = runTest {
    val step = step(listOf("number", "string"), fixed("temperatureC", "greaterThan", "25"), fixed("status", "equal", "error"), match = "any")
    assertEquals("success", route(step, """{"temperatureC":30,"status":"ok"}"""))
    assertEquals("success", route(step, """{"temperatureC":20,"status":"error"}"""))
    assertEquals("failure", route(step, """{"temperatureC":20,"status":"ok"}"""))
    // A missing value only makes its own comparison not hold.
    assertEquals("success", route(step, """{"status":"error"}"""))
  }

  @Test
  fun `missing, mistyped and non-JSON inputs fail the condition`() = runTest {
    val step = step(listOf("number"), fixed("temperatureC", "equal", "25"))
    assertEquals("failure", route(step, """{}"""))
    assertEquals("failure", route(step, """{"temperatureC":"25"}"""))
    assertEquals("failure", route(step, """{"temperatureC":null}"""))
    assertEquals("failure", route(step, "not json"))
    var port: String? = null
    step.process(StepMessage.signal(), context) { port = it.port }
    assertEquals("failure", port)
  }

  @Test
  fun `invalid configurations and compiled data are rejected`() {
    assertThrows<StepConfigurationException> { step(listOf("number"), fixed("x", "equal", "warm")) }
    assertThrows<StepConfigurationException> { step(listOf("string"), fixed("x", "greaterThan", "a")) }
    assertThrows<StepConfigurationException> { step(listOf("number"), """{"left":"x","operator":"equal","compareTo":"value"}""") }
    assertThrows<StepConfigurationException> { step(listOf("number"), """{"left":"x","operator":"equal","compareTo":"variable"}""") }
    // The compiled value types must match the comparisons.
    assertThrows<StepConfigurationException> { step(listOf(), fixed("x", "equal", "1")) }
    assertThrows<StepConfigurationException> { step(listOf("date"), fixed("x", "equal", "1")) }
    assertThrows<StepConfigurationException> {
      CompareStepFactory().create(StepSpec("cmp", "Compare", "compare", 1, """{"modelId":"m1","match":"all","comparisons":[${fixed("x", "equal", "1")}]}"""))
    }
  }
}
