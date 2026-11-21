package com.gruent.runtime.invocations

import kotlinx.serialization.KSerializer
import kotlinx.serialization.Serializable
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.Json
import java.time.Instant
import java.time.format.DateTimeFormatter
import java.util.Base64

/**
 * The message that starts one execution of a channel (`routing.Invocation` in libs/engine/routing). Sources
 * publish it to the binding's subject, `gruent.v1.invocations.<channel ID>`.
 */
@Serializable
data class Invocation(
    val apiVersion: String = API_VERSION,
    val kind: String = KIND,
    val id: String,
    val metadata: InvocationMetadata,
    val planVersion: String,
    val bindingId: String,
    val stepId: String,
    val trigger: String,
    @Serializable(with = InstantSerializer::class)
    val receivedAt: Instant,
    val contentType: String? = null,
    @Serializable(with = Base64Serializer::class)
    val payload: ByteArray? = null,
    val http: HttpRequest? = null,
    val messageQueue: QueueMessage? = null,
    val reply: ReplyPolicy? = null,
) {
    companion object {
        const val API_VERSION = "gruent.io/v1"
        const val KIND = "Invocation"
    }
}

@Serializable
data class InvocationMetadata(
    val orgId: String = "",
    val spaceId: String = "",
    val channelId: String,
    val channelName: String? = null,
)

@Serializable
data class HttpRequest(
    val method: String,
    val path: String,
    val query: String? = null,
    val headers: Map<String, List<String>>? = null,
)

@Serializable
data class QueueMessage(val broker: String, val topic: String)

/** When to reply: once the execution finished ([MODE_SYNC]) or once it was admitted ([MODE_ASYNC]). */
@Serializable
data class ReplyPolicy(val mode: String, val timeoutMs: Long) {
    companion object {
        const val MODE_SYNC = "sync"
        const val MODE_ASYNC = "async"
    }
}

/** A runtime's answer to an invocation with a [ReplyPolicy] (`routing.Reply`). */
@Serializable
data class Reply(
    val overflow: Boolean = false,
    val status: Int = 0,
    val headers: Map<String, List<String>>? = null,
    @Serializable(with = Base64Serializer::class)
    val body: ByteArray? = null,
)

/** JSON encoding shared with the Go contract: unknown fields are ignored and absent values are omitted. */
val InvocationJson = Json {
    ignoreUnknownKeys = true
    encodeDefaults = true
    explicitNulls = false
}

/** Go encodes []byte as standard base64. */
object Base64Serializer : KSerializer<ByteArray> {
    override val descriptor = PrimitiveSerialDescriptor("Base64Bytes", PrimitiveKind.STRING)

    override fun serialize(encoder: Encoder, value: ByteArray) =
        encoder.encodeString(Base64.getEncoder().encodeToString(value))

    override fun deserialize(decoder: Decoder): ByteArray = Base64.getDecoder().decode(decoder.decodeString())
}

/** Go encodes time.Time as RFC 3339 with nanoseconds. */
object InstantSerializer : KSerializer<Instant> {
    override val descriptor = PrimitiveSerialDescriptor("Instant", PrimitiveKind.STRING)

    override fun serialize(encoder: Encoder, value: Instant) =
        encoder.encodeString(DateTimeFormatter.ISO_INSTANT.format(value))

    override fun deserialize(decoder: Decoder): Instant =
        Instant.from(DateTimeFormatter.ISO_OFFSET_DATE_TIME.parse(decoder.decodeString()))
}
