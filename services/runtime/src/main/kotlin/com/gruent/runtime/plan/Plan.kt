package com.gruent.runtime.plan

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement

/**
 * The execution plan, as compiled by the controller (`services/controller/internal/plan`). Only the fields
 * the runtime uses are modelled; unknown fields are ignored so that additive plan changes don't break
 * deployed runtimes.
 */
@Serializable
data class Plan(
    val apiVersion: String,
    val kind: String,
    val metadata: Metadata,
    val publishStrategy: PublishStrategy = PublishStrategy(),
    val channel: Channel,
    val bindings: Bindings = Bindings(),
    /** The plan's dependency bundle (see [com.gruent.runtime.dependencies.DependencyBundle]). */
    val dependencies: ArtifactRef? = null,
    val policies: Policies,
) {
    companion object {
        /** Stable wire identity of signed plans (`routing.APIVersion`), independent of the marketing domain. */
        const val API_VERSION = "gruent.com/v1"
        const val KIND = "Plan"

        /** Go encodes empty slices as null, so nulls fall back to the property defaults. */
        val json = Json {
            ignoreUnknownKeys = true
            coerceInputValues = true
        }

        fun parse(data: ByteArray): Plan {
            val plan = json.decodeFromString(serializer(), data.decodeToString())
            require(plan.apiVersion == API_VERSION && plan.kind == KIND) {
                "unsupported plan ${plan.apiVersion}/${plan.kind}; expected $API_VERSION/$KIND"
            }
            return plan
        }
    }
}

@Serializable
data class Metadata(
    val orgId: String = "",
    val spaceId: String = "",
    val channelId: String,
    val channelName: String = "",
)

/** Identity of a signed artifact: its kind, version (digest) and storage key. */
@Serializable
data class ArtifactRef(val kind: String, val version: String, val key: String)

@Serializable
data class PublishStrategy(val mode: String = "replace")

@Serializable
data class Channel(val name: String = "", val graph: Graph)

@Serializable
data class Graph(val steps: List<Step> = emptyList(), val edges: List<Edge> = emptyList())

@Serializable
data class Step(
    val id: String,
    /** "<category>.<label>", e.g. "source.timer-source". */
    val type: String,
    val version: String = "",
    val name: String = "",
    val definition: StepDefinition? = null,
    /** Canonical JSON of the step configuration. */
    val config: JsonElement? = null,
    val bindingRef: String = "",
    val redaction: Redaction? = null,
    /** Step-specific data compiled by the controller (see [com.gruent.steps.api.StepSpec.compiledJson]). */
    val compiled: JsonElement? = null,
    /** IDs of the connections the step uses, hydrated from the dependency bundle. */
    val connectionRefs: List<String> = emptyList(),
) {
    val category: String get() = type.substringBefore('.')
}

@Serializable
data class StepDefinition(val pluginType: String, val pluginVersion: Int, val digest: String)

@Serializable
data class Redaction(val modelRef: String = "", val paths: List<String> = emptyList(), val replacement: String)

@Serializable
data class Edge(val from: String, val fromPort: String = "", val to: String, val toPort: String = "")

@Serializable
data class Bindings(
    val http: List<HttpBinding> = emptyList(),
    val timer: List<TimerBinding> = emptyList(),
    val messageQueue: List<MessageQueueBinding> = emptyList(),
)

@Serializable
data class Overflow(val action: String, val httpStatus: Int = 0)

@Serializable
data class HttpBinding(
    val bindingId: String,
    val stepId: String,
    val method: String,
    val path: String,
    val responseMode: String,
    val timeoutMs: Long,
    val subject: String,
    val overflow: Overflow,
)

@Serializable
data class TimerBinding(
    val bindingId: String,
    val stepId: String,
    val cronExpression: String,
    val subject: String,
    val overflow: Overflow,
)

@Serializable
data class MessageQueueBinding(
    val bindingId: String,
    val stepId: String,
    val broker: String,
    val connectionRef: String = "",
    val topic: String,
    val subject: String,
    val overflow: Overflow,
)

@Serializable
data class Policies(val runtime: RuntimePolicy)

@Serializable
data class RuntimePolicy(
    val executionClass: String = "standard",
    val concurrency: Concurrency,
    val timeouts: Timeouts = Timeouts(),
)

@Serializable
data class Concurrency(val maxConcurrentExecutions: Int, val maxQueuedExecutions: Int = 0)

@Serializable
data class Timeouts(val maxInvocationMs: Long = 0)
