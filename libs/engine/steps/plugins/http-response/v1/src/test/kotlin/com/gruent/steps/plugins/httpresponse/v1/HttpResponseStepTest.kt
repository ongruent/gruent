package com.gruent.steps.plugins.httpresponse.v1

import com.gruent.steps.api.ExecutionContext
import com.gruent.steps.api.ExecutionLogger
import com.gruent.steps.api.Response
import com.gruent.steps.api.StepMessage
import com.gruent.steps.api.StepSpec
import com.gruent.steps.api.Trigger
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test
import java.time.Instant

class HttpResponseStepTest {
  private val responses = mutableListOf<Response>()
  private val warnings = mutableListOf<String>()
  private val context = object : ExecutionContext {
    override val executionId = "e1"
    override val channelId = "c1"
    override val planVersion = "sha256:1"
    override val trigger = Trigger(Trigger.TYPE_HTTP, "b1", Instant.EPOCH)
    override val logger = ExecutionLogger { _, message, _ -> warnings += message }
    override fun respond(response: Response): Boolean = responses.isEmpty() && responses.add(response)
  }

  private fun step(config: String) = HttpResponseStepFactory().create(StepSpec("res", "Respond", "http-response", 1, config)) as HttpResponseStep

  @Test
  fun `answers with the input and its content type`() = runTest {
    step("""{"statusCode":201,"body":"input","headers":["Cache-Control: no-store"]}""")
      .process(StepMessage.data("""{"ok":true}""".toByteArray(), "application/json"), context) {}
    val response = responses.single()
    assertEquals(201, response.status)
    assertEquals(mapOf("Cache-Control" to listOf("no-store"), "Content-Type" to listOf("application/json")), response.headers)
    assertEquals("""{"ok":true}""", String(response.body!!))
  }

  @Test
  fun `answers without a body and warns when already answered`() = runTest {
    val step = step("""{"statusCode":204,"body":"none"}""")
    step.process(StepMessage.data("x".toByteArray(), "text/plain"), context) {}
    step.process(StepMessage.data("y".toByteArray()), context) {}
    assertNull(responses.single().body)
    assertEquals(emptyMap<String, List<String>>(), responses.single().headers)
    assertEquals(1, warnings.size)
  }
}
