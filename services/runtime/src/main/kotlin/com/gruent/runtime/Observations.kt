package com.gruent.runtime

import com.gruent.runtime.invocations.InstantSerializer
import com.gruent.runtime.invocations.InvocationJson
import com.gruent.runtime.invocations.MessageBus
import kotlinx.serialization.Serializable
import org.slf4j.LoggerFactory
import java.time.Clock
import java.time.Instant

/**
 * A runtime's report about the plan version it serves (`workers.Observation` in libs/engine/workers). The
 * controller records it as the channel's observed state; it is the only way a channel becomes
 * `PUBLISHED`.
 */
@Serializable
data class Observation(
    val apiVersion: String = "gruent.com/v1",
    val kind: String = "RuntimeObservation",
    val channelId: String,
    val planVersion: String,
    /** [APPLIED], [FAILED] or [STOPPED]. */
    val status: String,
    val message: String = "",
    @Serializable(with = InstantSerializer::class)
    val observedAt: Instant,
) {
    companion object {
        const val APPLIED = "applied"
        const val FAILED = "failed"
        const val STOPPED = "stopped"

        fun subject(channelId: String) = "gruent.v1.runtime.observations.$channelId"
    }
}

/** Publishes observations. Reporting is best effort: the runtime keeps serving if the controller is away. */
class ObservationReporter(
    private val bus: MessageBus,
    private val channelId: String,
    private val planVersion: String,
    private val clock: Clock = Clock.systemUTC(),
) {
    private val log = LoggerFactory.getLogger(ObservationReporter::class.java)

    fun report(status: String, message: String = "") {
        val observation = Observation(
            channelId = channelId,
            planVersion = planVersion,
            status = status,
            message = message,
            observedAt = clock.instant()
        )
        try {
            bus.publish(
                Observation.subject(channelId),
                InvocationJson.encodeToString(Observation.serializer(), observation).toByteArray()
            )
            bus.flush()
        } catch (e: Exception) {
            log.warn("Could not report status {} of channel {}: {}", status, channelId, e.message)
        }
    }
}
