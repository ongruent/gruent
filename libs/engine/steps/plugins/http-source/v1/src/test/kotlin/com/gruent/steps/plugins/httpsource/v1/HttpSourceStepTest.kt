package com.gruent.steps.plugins.httpsource.v1

import com.gruent.steps.api.ExecutionContext
import com.gruent.steps.api.ExecutionLogger
import com.gruent.steps.api.SourceStep
import com.gruent.steps.api.StepConfigurationException
import com.gruent.steps.api.StepMessage
import com.gruent.steps.api.StepSpec
import com.gruent.steps.api.Trigger
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import java.time.Instant

class HttpSourceStepTest {
  private val logged = mutableListOf<Map<String, String>>()

  private fun context(trigger: Trigger) = object : ExecutionContext {
    override val executionId = "e1"
    override val channelId = "c1"
    override val planVersion = "sha256:1"
    override val trigger = trigger
    override val logger = ExecutionLogger { _, _, attributes -> logged += attributes }
  }

  private fun step(config: String = """{"method":"POST","responseMode":"sync","responseTimeout":10}""") =
    HttpSourceStepFactory().create(StepSpec("src", "HTTP", "http-source", 1, config)) as SourceStep

  private fun request(body: String, contentType: String? = null) =
    Trigger(Trigger.TYPE_HTTP, "http-src", Instant.EPOCH, contentType, body.toByteArray())

  @Test
  fun `the request body starts the execution`() {
    val trigger = request("""{"id":"d1"}""", "application/json")
    val message = step().receive(trigger, context(trigger))
    assertEquals(StepMessage.Kind.DATA, message.kind)
    assertEquals("""{"id":"d1"}""", String(message.payload))
    assertEquals("application/json", message.contentType)
    assertEquals(mapOf("method" to "POST", "bytes" to "11", "contentType" to "application/json"), logged.single())
  }

  @Test
  fun `a request without a body starts the execution with a signal`() {
    val trigger = request("")
    val message = step("""{"method":"GET","responseMode":"async","responseTimeout":10}""").receive(trigger, context(trigger))
    assertEquals(StepMessage.Kind.SIGNAL, message.kind)
  }

  @Test
  fun `a blank content type is dropped`() {
    val trigger = request("raw", "")
    assertNull(step().receive(trigger, context(trigger)).contentType)
  }

  @Test
  fun `the configuration is validated`() {
    assertThrows<StepConfigurationException> {
      HttpSourceStepFactory().create(StepSpec("src", "HTTP", "http-source", 1, """{"method":"TRACE","responseMode":"sync","responseTimeout":10}"""))
    }
  }
}
