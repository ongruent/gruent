package com.gruent.steps.plugins.log.v1

import com.gruent.steps.api.ExecutionContext
import com.gruent.steps.api.ExecutionLogger
import com.gruent.steps.api.LogLevel
import com.gruent.steps.api.Redaction
import com.gruent.steps.api.StepConfigurationException
import com.gruent.steps.api.StepMessage
import com.gruent.steps.api.StepSpec
import com.gruent.steps.api.Trigger
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import java.time.Instant

class LogStepTest {
  private data class Entry(val level: LogLevel, val message: String, val attributes: Map<String, String>)

  private val entries = mutableListOf<Entry>()
  private val context = object : ExecutionContext {
    override val executionId = "e1"
    override val channelId = "c1"
    override val planVersion = "sha256:1"
    override val trigger = Trigger(Trigger.TYPE_HTTP, "b1", Instant.EPOCH)
    override val logger = ExecutionLogger { level, message, attributes -> entries += Entry(level, message, attributes) }
  }

  private fun step(config: String, redaction: Redaction? = null) =
    LogStepFactory().create(StepSpec("log", "Log", "log", 1, config, redaction))

  private suspend fun log(config: String, message: StepMessage, redaction: Redaction? = null): Entry {
    (step(config, redaction) as LogStep).process(message, context) {}
    return entries.last()
  }

  @Test
  fun `signals are logged without data`() = runTest {
    val entry = log("""{"level":"info"}""", StepMessage.signal())
    assertEquals(Entry(LogLevel.INFO, "Signal received", mapOf("input" to "signal")), entry)
  }

  @Test
  fun `JSON input is pretty-printed at the configured level with the configured message`() = runTest {
    val entry = log("""{"level":"warn","message":"Reading"}""", StepMessage.data("""{"a":1}""".toByteArray(), "application/json"))
    assertEquals(LogLevel.WARN, entry.level)
    assertEquals("Reading", entry.message)
    assertEquals("{\n    \"a\": 1\n}", entry.attributes["data"])
    assertEquals("application/json", entry.attributes["contentType"])
  }

  @Test
  fun `text and binary input`() = runTest {
    assertEquals("hello", log("""{"level":"debug"}""", StepMessage.data("hello".toByteArray())).attributes["data"])
    val binary = log("""{"level":"debug"}""", StepMessage.data(byteArrayOf(0xff.toByte(), 0x00)))
    assertEquals("/wA=", binary.attributes["data"])
    assertEquals("base64", binary.attributes["dataEncoding"])
  }

  @Test
  fun `sensitive fields are redacted`() = runTest {
    val input = """
      {"user":"ann","password":"p","card":{"number":"4111","brand":"visa"},
       "readings":[{"token":"t1","value":1},{"token":"t2","value":2}],"nested":[[{"secret":"s"}]]}
    """.trimIndent()
    val redaction = Redaction(listOf("password", "card.number", "readings[].token", "nested[][].secret", "missing.field"), "[REDACTED]")
    val entry = log("""{"level":"info","redactionModelId":"m1"}""", StepMessage.data(input.toByteArray()), redaction)
    assertEquals(
      Json.parseToJsonElement(
        """
          {"user":"ann","password":"[REDACTED]","card":{"number":"[REDACTED]","brand":"visa"},
           "readings":[{"token":"[REDACTED]","value":1},{"token":"[REDACTED]","value":2}],"nested":[[{"secret":"[REDACTED]"}]]}
        """.trimIndent(),
      ),
      Json.parseToJsonElement(entry.attributes.getValue("data")),
    )
  }

  @Test
  fun `redaction fails closed for input that is not JSON`() = runTest {
    val entry = log("""{"level":"info","redactionModelId":"m1"}""", StepMessage.data("password=p".toByteArray()), Redaction(listOf("password"), "[REDACTED]"))
    assertNull(entry.attributes["data"])
    assertFalse(entry.attributes["payloadOmitted"].isNullOrEmpty())
  }

  @Test
  fun `large input is truncated`() = runTest {
    val entry = log("""{"level":"info"}""", StepMessage.data("x".repeat(LogStep.MAX_DATA_CHARS + 10).toByteArray()))
    assertEquals(LogStep.MAX_DATA_CHARS, entry.attributes.getValue("data").length)
    assertEquals("true", entry.attributes["dataTruncated"])
  }

  @Test
  fun `invalid configurations are rejected`() {
    assertThrows<StepConfigurationException> { step("""{"level":"loud"}""") }
    assertThrows<StepConfigurationException> { step("""{}""") }
    // A sensitive fields model without the controller's redaction paths would log the sensitive fields.
    assertThrows<StepConfigurationException> { step("""{"level":"info","redactionModelId":"m1"}""") }
  }
}
