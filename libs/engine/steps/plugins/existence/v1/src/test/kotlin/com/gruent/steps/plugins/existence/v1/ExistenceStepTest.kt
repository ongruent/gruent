package com.gruent.steps.plugins.existence.v1

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
import java.time.Instant

class ExistenceStepTest {
  private val logs = mutableListOf<Map<String, String>>()
  private val context = object : ExecutionContext {
    override val executionId = "e1"
    override val channelId = "c1"
    override val planVersion = "sha256:1"
    override val trigger = Trigger(Trigger.TYPE_HTTP, "b1", Instant.EPOCH)
    override val logger = ExecutionLogger { _, _, attributes -> logs += attributes }
  }

  private fun step(match: String = "all", nullIsMissing: Boolean? = null, paths: List<String> = listOf("device.id", "readings[].value")) =
    ExistenceStepFactory().create(
      StepSpec(
        "exists", "Exists", "existence", 1,
        """{"modelId":"m1","match":"$match"${nullIsMissing?.let { ",\"nullIsMissing\":$it" } ?: ""}}""",
        compiledJson = """{"modelRef":"m1","paths":[${paths.joinToString(",") { "\"$it\"" }}]}""",
      ),
    ) as ExistenceStep

  private suspend fun route(step: ExistenceStep, input: String): String? {
    var port: String? = null
    step.process(StepMessage.data(input.toByteArray(), "application/json"), context) { port = it.port }
    return port
  }

  @Test
  fun `every field must be present`() = runTest {
    val step = step()
    assertEquals(StepMessage.PORT_SUCCESS, route(step, """{"device":{"id":"d1"},"readings":[{"value":1}]}"""))
    assertEquals(StepMessage.PORT_FAILURE, route(step, """{"device":{"id":"d1"},"readings":[{"value":1},{}]}"""))
    assertEquals("readings[].value", logs.last()[ExistenceStep.ATTRIBUTE_MISSING])
  }

  @Test
  fun `any field may be present`() = runTest {
    val step = step(match = "any")
    assertEquals(StepMessage.PORT_SUCCESS, route(step, """{"device":{"id":"d1"}}"""))
    assertEquals(StepMessage.PORT_FAILURE, route(step, """{"device":{}}"""))
  }

  @Test
  fun `null counts as missing unless configured otherwise`() = runTest {
    val input = """{"device":{"id":null},"readings":[]}"""
    assertEquals(StepMessage.PORT_FAILURE, route(step(), input))
    assertEquals(StepMessage.PORT_SUCCESS, route(step(nullIsMissing = false), input))
  }

  @Test
  fun `the input passes through unchanged`() = runTest {
    var output: StepMessage? = null
    val input = StepMessage.data("""{"device":{"id":"d1"},"readings":[]}""".toByteArray(), "application/json")
    step().process(input, context) { output = it }
    assertEquals(String(input.payload), String(output!!.payload))
    assertEquals("application/json", output!!.contentType)
  }

  @Test
  fun `input that is not a JSON object and signals fail the condition`() = runTest {
    assertEquals(StepMessage.PORT_FAILURE, route(step(), "not json"))
    assertEquals(StepMessage.PORT_FAILURE, route(step(), "[1]"))
    var port: String? = null
    step().process(StepMessage.signal(), context) { port = it.port }
    assertEquals(StepMessage.PORT_FAILURE, port)
  }

  @Test
  fun `the plan must carry compiled paths`() {
    assertThrows<StepConfigurationException> {
      ExistenceStepFactory().create(StepSpec("exists", "Exists", "existence", 1, """{"modelId":"m1","match":"all"}"""))
    }
    assertThrows<StepConfigurationException> {
      ExistenceStepFactory().create(StepSpec("exists", "Exists", "existence", 1, """{"modelId":"m1","match":"all"}""", compiledJson = """{"paths":["a..b"]}"""))
    }
  }
}
