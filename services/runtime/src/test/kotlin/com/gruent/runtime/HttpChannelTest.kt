package com.gruent.runtime

import com.gruent.runtime.invocations.InMemoryMessageBus
import com.gruent.runtime.invocations.InvocationJson
import com.gruent.runtime.invocations.Reply
import com.gruent.runtime.steps.StepRegistry
import com.gruent.runtime.telemetry.ExecutionStatus
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test
import java.time.Duration
import java.util.Base64

/**
 * Applies the plan of an HTTP source -> existence -> HTTP response (200 on success, 500 on failure) with the
 * runtime's built-in steps, and sends it invocations the way `routing.Ingress` does: request/reply on the
 * channel's invocation subject.
 */
class HttpChannelTest {
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
  private val bus = InMemoryMessageBus(scope)
  private val telemetry = RecordingTelemetry()

  @AfterEach
  fun tearDown() = scope.cancel()

  // The steps the runtime discovers on its classpath, as in production.
  private val worker = ChannelWorker(timerToLogPlan(httpExistencePlanJson()), PLAN_VERSION, StepRegistry.discover(), bus, telemetry)
    .also { it.start(scope) }

  /** An invocation as the Go ingress encodes it (`routing.HTTPInvocation`). */
  private fun invocationJson(body: String, contentType: String = "application/json") = """
    {
      "apiVersion": "gruent.com/v1",
      "kind": "Invocation",
      "id": "inv-${System.nanoTime()}",
      "metadata": {"orgId": "org1", "spaceId": "space1", "channelId": "$CHANNEL_ID"},
      "planVersion": "$PLAN_VERSION",
      "bindingId": "bind_n_src",
      "stepId": "n_src",
      "trigger": "http",
      "receivedAt": "2026-11-22T10:00:00.123456789Z",
      "contentType": "$contentType",
      "payload": "${Base64.getEncoder().encodeToString(body.toByteArray())}",
      "http": {"method": "POST", "path": "/v1/trigger/http/$CHANNEL_ID", "headers": {"Content-Type": ["$contentType"]}},
      "reply": {"mode": "sync", "timeoutMs": 10000}
    }
  """.trimIndent()

  private fun request(body: String): Reply = runBlocking {
    val reply = CompletableDeferred<Reply>()
    bus.request("gruent.v1.invocations.$CHANNEL_ID", invocationJson(body).toByteArray()) {
      reply.complete(InvocationJson.decodeFromString(Reply.serializer(), it.decodeToString()))
    }
    withTimeout(5_000) { reply.await() }
  }

  @Test
  fun `the runtime implements the HTTP source and every other step of the plan`() {
    val registry = StepRegistry.discover()
    for (step in timerToLogPlan(httpExistencePlanJson()).channel.graph.steps) {
      assertEquals(step.definition!!.pluginType, registry.factory(step).pluginType)
    }
  }

  @Test
  fun `a request with the field takes the success branch and is answered 200 with its body`() {
    val reply = request("""{"deviceId":"d1","temperatureC":21.5}""")
    assertEquals(200, reply.status)
    assertEquals("""{"deviceId":"d1","temperatureC":21.5}""", reply.body?.decodeToString())
    assertEquals(mapOf("Content-Type" to listOf("application/json")), reply.headers)
    runBlocking { worker.stop(Duration.ofSeconds(5)) }
    assertEquals(listOf(ExecutionStatus.COMPLETED), telemetry.executions.map { it.second })
  }

  @Test
  fun `a request without the field takes the failure branch and is answered 500`() {
    val reply = request("""{"temperatureC":21.5}""")
    assertEquals(500, reply.status)
    assertNull(reply.body)
    runBlocking { worker.stop(Duration.ofSeconds(5)) }
    assertEquals(listOf(ExecutionStatus.COMPLETED), telemetry.executions.map { it.second })
  }

  @Test
  fun `a body that is not JSON takes the failure branch`() {
    assertEquals(500, request("not json").status)
  }
}
