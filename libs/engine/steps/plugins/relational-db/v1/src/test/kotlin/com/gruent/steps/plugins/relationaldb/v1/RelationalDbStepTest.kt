package com.gruent.steps.plugins.relationaldb.v1

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

class RelationalDbStepTest {
  private val context = object : ExecutionContext {
    override val executionId = "e1"
    override val channelId = "c1"
    override val planVersion = "sha256:1"
    override val trigger = Trigger(Trigger.TYPE_HTTP, "b1", Instant.EPOCH)
    override val logger = ExecutionLogger { _, _, _ -> }
  }
  private val executed = mutableListOf<Pair<String, List<Any?>>>()
  private val driver = object : RelationalDriver {
    override fun execute(statement: String, parameters: List<Any?>): Int {
      executed += statement to parameters
      return 1
    }
  }
  private val config = """{"engine":"POSTGRES_SERVER","connectionId":"t6","statement":"INSERT INTO r VALUES ({{input.device.id}}, {{input.c}})"}"""
  private val compiled = """{"engine":"POSTGRES_SERVER","statement":"INSERT INTO r VALUES ($1, $2, $1)","parameters":["device.id","c"]}"""

  @Test
  fun `input values are bound as parameters`() = runTest {
    val step = RelationalDbStepFactory(mapOf("POSTGRES_SERVER" to { _ -> driver }))
      .create(StepSpec("db", "DB", "relational-db", 1, config, compiledJson = compiled, connections = mapOf("t6" to "{}"))) as RelationalDbStep
    var output: StepMessage? = null
    val input = StepMessage.data("""{"device":{"id":"d1'); DROP TABLE r; --"},"c":21.5}""".toByteArray())
    step.process(input, context) { output = it }
    assertEquals("INSERT INTO r VALUES ($1, $2, $1)", executed.single().first)
    assertEquals(listOf("d1'); DROP TABLE r; --", "21.5".toBigDecimal()), executed.single().second)
    assertEquals(input, output)
  }

  @Test
  fun `connections must be hydrated`() {
    assertThrows<StepConfigurationException> {
      RelationalDbStepFactory().create(StepSpec("db", "DB", "relational-db", 1, config, compiledJson = compiled))
    }
  }

  @Test
  fun `postgres connections become JDBC URLs`() {
    PostgresDriver.fromConnection("""{"host":"db","port":5432,"database":"iot","username":"u","password":"p"}""")
    assertThrows<IllegalArgumentException> { PostgresDriver.fromConnection("""{"database":"iot"}""") }
  }
}
