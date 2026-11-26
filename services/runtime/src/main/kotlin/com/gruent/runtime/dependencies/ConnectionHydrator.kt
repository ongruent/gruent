package com.gruent.runtime.dependencies

import com.gruent.runtime.plan.Plan
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/** Thrown when the plan's connections can't be hydrated. The runtime then fails to apply the plan. */
class HydrationException(message: String, cause: Throwable? = null) : Exception(message, cause)

/**
 * Hydrates the connections that the plan's steps use (`connectionRefs`) from the plan's dependency bundle:
 * each connection's attributes, with the value of every secret field resolved from its reference. Secrets
 * are resolved when the plan is applied and only kept in memory, so rotating a secret takes effect when the
 * worker restarts.
 *
 * Returns the hydrated attributes as JSON by connection ID (see [com.gruent.steps.api.StepSpec.connections]).
 * Connections without secret fields (e.g. a Postgres connection without a password) never need a
 * [SecretResolver].
 */
object ConnectionHydrator {
  fun hydrate(plan: Plan, bundle: DependencyBundle, secrets: SecretResolver?): Map<String, String> {
    val used = plan.channel.graph.steps.flatMap { it.connectionRefs }.toSortedSet()
    if (used.isEmpty()) return emptyMap()
    if (bundle.metadata.channelId != plan.metadata.channelId || bundle.metadata.spaceId != plan.metadata.spaceId) {
      throw HydrationException("the dependency bundle is for channel ${bundle.metadata.channelId}, not ${plan.metadata.channelId}")
    }
    val connections = bundle.connections.associateBy { it.id }
    return used.associateWith { id ->
      val connection = connections[id] ?: throw HydrationException("connection $id is not in the plan's dependency bundle")
      hydrate(plan.metadata.spaceId, connection, secrets).toString()
    }
  }

  private fun hydrate(spaceId: String, connection: Connection, secrets: SecretResolver?): JsonObject {
    val label = "connection ${connection.id} (${connection.category})"
    val attributes = connection.attributes as? JsonObject
      ?: throw HydrationException("$label can't be hydrated: the runtime doesn't know its sensitive attributes")
    if (connection.certificateFields.isNotEmpty()) {
      throw HydrationException("$label uses certificates, which the runtime doesn't resolve yet")
    }
    if (connection.secretFields.isEmpty()) return attributes

    val resolved = connection.secretFields.mapValues { (field, reference) ->
      val ref = try {
        SecretRef.parse(reference)
      } catch (e: IllegalArgumentException) {
        throw HydrationException("$label: ${e.message}", e)
      }
      // A plan only ever resolves its own space's secrets.
      if (ref.spaceId != spaceId) {
        throw HydrationException("$label refers to a secret of another space")
      }
      if (secrets == null) {
        throw HydrationException("$label needs the secret ${ref.key} for $field, but the runtime has no secret store configured")
      }
      try {
        JsonPrimitive(secrets.resolve(ref))
      } catch (e: SecretResolutionException) {
        throw HydrationException("$label: could not resolve $field: ${e.message}", e)
      }
    }
    return JsonObject(attributes + resolved)
  }
}
