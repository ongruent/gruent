package com.gruent.nodes.config

import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject

/** A configuration problem. [path] is a JSON Pointer into the configuration ("" is the root). */
data class ConfigViolation(val path: String, val message: String)

/** Thrown when configuration does not satisfy its plugin version's configSchema. */
class ConfigValidationException(
  val pluginType: String,
  val pluginVersion: Int,
  val violations: List<ConfigViolation>,
) : IllegalArgumentException(
  "invalid configuration for $pluginType@$pluginVersion: " +
    violations.joinToString("; ") { "${it.path.ifEmpty { "(root)" }} ${it.message}" },
)

/**
 * Implemented by the companion object of every generated configuration type. The identity and digest tie the
 * generated class to exactly one immutable node.json; the runtime must select plugins by the same
 * (pluginType, pluginVersion) pair recorded in the deployment plan.
 */
interface NodeConfigDefinition<T> {
  val pluginType: String
  val pluginVersion: Int
  val contractVersion: Int

  /** "sha256:<hex>" of the original node.json bytes. */
  val definitionDigest: String

  /** Validates configuration JSON. Produces the same violation paths as the Go and TypeScript validators. */
  fun validate(element: JsonElement): List<ConfigViolation>

  /** Builds the typed value from configuration that already passed [validate]. */
  fun fromValidated(obj: JsonObject): T

  fun toJsonObject(value: T): JsonObject

  fun decode(element: JsonElement): T {
    val violations = validate(element)
    if (violations.isNotEmpty()) throw ConfigValidationException(pluginType, pluginVersion, violations)
    return fromValidated(element.jsonObject)
  }

  fun decode(json: String): T {
    val element =
      try {
        Json.parseToJsonElement(json)
      } catch (e: SerializationException) {
        throw ConfigValidationException(pluginType, pluginVersion, listOf(ConfigViolation("", "invalid JSON: ${e.message}")))
      }
    return decode(element)
  }

  /** Encodes without nulls: absent optional values are omitted, never written as null. */
  fun encode(value: T): String = toJsonObject(value).toString()
}

/** Conversion helpers used by generated code. Only called on values that passed validation. */
object ConfigCodec {
  fun string(e: JsonElement): String = (e as JsonPrimitive).content

  fun boolean(e: JsonElement): Boolean = (e as JsonPrimitive).content == "true"

  fun long(e: JsonElement): Long = (e as JsonPrimitive).content.toBigDecimal().longValueExact()

  fun double(e: JsonElement): Double = (e as JsonPrimitive).content.toDouble()

  fun <T> list(e: JsonElement, item: (JsonElement) -> T): List<T> = (e as JsonArray).map(item)

  fun primitive(v: String): JsonElement = JsonPrimitive(v)

  fun primitive(v: Long): JsonElement = JsonPrimitive(v)

  fun primitive(v: Double): JsonElement = JsonPrimitive(v)

  fun primitive(v: Boolean): JsonElement = JsonPrimitive(v)

  fun array(items: List<JsonElement>): JsonElement = JsonArray(items)

  fun objectOf(vararg entries: Pair<String, JsonElement?>): JsonObject =
    JsonObject(entries.filter { it.second != null }.associate { it.first to it.second!! })
}
