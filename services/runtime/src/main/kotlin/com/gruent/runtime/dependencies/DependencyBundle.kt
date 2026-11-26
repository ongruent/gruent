package com.gruent.runtime.dependencies

import com.gruent.runtime.plan.Metadata
import com.gruent.runtime.plan.Plan
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

/**
 * The dependencies of a plan revision, as compiled by the controller (`plan.DependencyBundle` in
 * services/controller/internal/plan). Only the fields the runtime uses are modelled. Sensitive values are
 * never embedded: secret and certificate fields are references that the runtime resolves when it applies
 * the plan.
 */
@Serializable
data class DependencyBundle(
  val apiVersion: String,
  val kind: String,
  val metadata: Metadata,
  val connections: List<Connection> = emptyList(),
) {
  companion object {
    const val KIND = "DependencyBundle"

    fun parse(data: ByteArray): DependencyBundle {
      val bundle = Plan.json.decodeFromString(serializer(), data.decodeToString())
      require(bundle.apiVersion == Plan.API_VERSION && bundle.kind == KIND) {
        "unsupported dependency bundle ${bundle.apiVersion}/${bundle.kind}; expected ${Plan.API_VERSION}/$KIND"
      }
      return bundle
    }
  }
}

/** A connection of the channel, with its sensitive attributes replaced by references. */
@Serializable
data class Connection(
  val id: String,
  val name: String = "",
  val category: String,
  val revision: String = "",
  /** The attributes without sensitive values, or null if the controller doesn't know the category's sensitive fields. */
  val attributes: JsonElement? = null,
  /** Attribute name to the secret reference its value is resolved from. */
  val secretFields: Map<String, String> = emptyMap(),
  /** Attribute name to the certificate reference its value is resolved from. */
  val certificateFields: Map<String, String> = emptyMap(),
)
