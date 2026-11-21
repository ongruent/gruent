package com.gruent.runtime.invocations

import org.junit.jupiter.api.Assertions.assertArrayEquals
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.time.Instant

class InvocationTest {
    @Test
    fun `decodes invocations encoded by Go`() {
        // json.Marshal(routing.HTTPInvocation(...))
        val json = """
      {"apiVersion":"gruent.com/v1","kind":"Invocation","id":"0a1b","metadata":{"orgId":"o","spaceId":"s","channelId":"c","channelName":"n"},
       "planVersion":"sha256:1","bindingId":"http-h","stepId":"h","trigger":"http","receivedAt":"2026-11-20T10:00:00.123456789Z",
       "contentType":"application/json","payload":"eyJhIjoxfQ==",
       "http":{"method":"POST","path":"/v1/trigger/http/c","headers":{"Content-Type":["application/json"]}},
       "reply":{"mode":"sync","timeoutMs":30000}}
    """.trimIndent()
        val invocation = InvocationJson.decodeFromString(Invocation.serializer(), json)
        assertEquals(Instant.parse("2026-11-20T10:00:00.123456789Z"), invocation.receivedAt)
        assertArrayEquals("""{"a":1}""".toByteArray(), invocation.payload)
        assertEquals(ReplyPolicy("sync", 30000), invocation.reply)
        assertEquals(listOf("application/json"), invocation.http!!.headers!!["Content-Type"])
    }

    @Test
    fun `encodes replies like Go`() {
        val encoded = InvocationJson.encodeToString(Reply.serializer(), Reply(status = 200, body = "ok".toByteArray()))
        assertTrue(encoded.contains("\"body\":\"b2s=\""))
        assertFalse(encoded.contains("headers"))
    }

    @Test
    fun `matches NATS wildcards`() {
        assertTrue(InMemoryMessageBus.matches("gruent.v1.runtime.observations.*", "gruent.v1.runtime.observations.c1"))
        assertTrue(InMemoryMessageBus.matches("gruent.>", "gruent.v1.invocations.c1"))
        assertFalse(InMemoryMessageBus.matches("gruent.v1.invocations.*", "gruent.v1.invocations"))
    }
}
