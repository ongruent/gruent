package com.gruent.steps.config

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import java.math.BigDecimal

/**
 * Validation primitives for the closed JSON Schema subset of step contract v1. Generated validators call these;
 * semantics match the Go (santhosh-tekuri/jsonschema) and TypeScript (Ajv) validators, which the shared
 * fixtures prove:
 * - no type coercion; null is never a valid value;
 * - integers are integral JSON numbers (1.0 is an integer), within declared Long bounds;
 * - string lengths count Unicode code points;
 * - patterns are unanchored searches;
 * - date-time follows [isDateTime];
 * - missing required and unknown properties are reported at the property's own pointer.
 */
class ConfigValidator {
  val violations = mutableListOf<ConfigViolation>()

  private fun fail(path: String, message: String) {
    violations += ConfigViolation(path, message)
  }

  fun objectAt(e: JsonElement, path: String): JsonObject? {
    if (e is JsonObject) return e
    fail(path, "must be an object")
    return null
  }

  fun closed(obj: JsonObject, path: String, properties: Set<String>, required: List<String>) {
    for (name in required) if (name !in obj) fail(child(path, name), "is required")
    for (name in obj.keys) if (name !in properties) fail(child(path, name), "is not allowed")
  }

  fun string(
    e: JsonElement,
    path: String,
    minLength: Int? = null,
    maxLength: Int? = null,
    pattern: Regex? = null,
    allowed: Set<String>? = null,
    dateTime: Boolean = false,
  ) {
    if (e !is JsonPrimitive || !e.isString) return fail(path, "must be a string")
    val s = e.content
    val length = s.codePointCount(0, s.length)
    if (minLength != null && length < minLength) fail(path, "must be at least $minLength characters")
    if (maxLength != null && length > maxLength) fail(path, "must be at most $maxLength characters")
    if (pattern != null && !pattern.containsMatchIn(s)) fail(path, "must match ${pattern.pattern}")
    if (allowed != null && s !in allowed) fail(path, "must be one of $allowed")
    if (dateTime && !isDateTime(s)) fail(path, "must be an RFC 3339 date-time such as 2026-01-01T09:00:00Z")
  }

  fun integer(e: JsonElement, path: String, minimum: Long, maximum: Long) {
    val n = numberOf(e)
    if (n == null || n.stripTrailingZeros().scale() > 0) return fail(path, "must be an integer")
    if (n < BigDecimal.valueOf(minimum)) fail(path, "must be >= $minimum")
    if (n > BigDecimal.valueOf(maximum)) fail(path, "must be <= $maximum")
  }

  fun number(
    e: JsonElement,
    path: String,
    minimum: Double? = null,
    maximum: Double? = null,
    exclusiveMinimum: Double? = null,
    exclusiveMaximum: Double? = null,
  ) {
    val n = numberOf(e) ?: return fail(path, "must be a number")
    if (minimum != null && n < BigDecimal.valueOf(minimum)) fail(path, "must be >= $minimum")
    if (maximum != null && n > BigDecimal.valueOf(maximum)) fail(path, "must be <= $maximum")
    if (exclusiveMinimum != null && n <= BigDecimal.valueOf(exclusiveMinimum)) fail(path, "must be > $exclusiveMinimum")
    if (exclusiveMaximum != null && n >= BigDecimal.valueOf(exclusiveMaximum)) fail(path, "must be < $exclusiveMaximum")
  }

  fun boolean(e: JsonElement, path: String) {
    if (e !is JsonPrimitive || e.isString || (e.content != "true" && e.content != "false")) fail(path, "must be a boolean")
  }

  fun array(
    e: JsonElement,
    path: String,
    minItems: Int? = null,
    maxItems: Int? = null,
    uniqueItems: Boolean = false,
    item: (JsonElement, String) -> Unit,
  ) {
    if (e !is JsonArray) return fail(path, "must be an array")
    if (minItems != null && e.size < minItems) fail(path, "must have at least $minItems items")
    if (maxItems != null && e.size > maxItems) fail(path, "must have at most $maxItems items")
    if (uniqueItems && e.map(::identity).toSet().size != e.size) fail(path, "items must be unique")
    e.forEachIndexed { i, el -> item(el, "$path/$i") }
  }

  private fun numberOf(e: JsonElement): BigDecimal? {
    if (e !is JsonPrimitive || e.isString || e is JsonNull) return null
    return e.content.toBigDecimalOrNull()
  }

  /** JSON equality key: numbers compare by value, so 1 and 1.0 are equal. */
  private fun identity(e: JsonElement): String {
    if (e is JsonPrimitive && !e.isString) numberOf(e)?.let { return "n:" + it.stripTrailingZeros().toPlainString() }
    if (e is JsonPrimitive && e.isString) return "s:" + e.content
    return "j:$e"
  }

  companion object {
    fun child(path: String, name: String): String = path + "/" + name.replace("~", "~0").replace("/", "~1")

    private val DATE_TIME = Regex("""^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d+)?(Z|[+-](\d{2}):(\d{2}))$""")

    /**
     * The contract's date-time profile: RFC 3339 with an upper-case "T", mandatory seconds, optional
     * fraction, and "Z" or ±hh:mm. Leap seconds are rejected. Identical in Go and TypeScript.
     */
    fun isDateTime(s: String): Boolean {
      val m = DATE_TIME.matchEntire(s) ?: return false
      val g = m.groupValues
      val year = g[1].toInt()
      val month = g[2].toInt()
      val day = g[3].toInt()
      if (month !in 1..12 || day < 1 || day > daysIn(year, month)) return false
      if (g[4].toInt() > 23 || g[5].toInt() > 59 || g[6].toInt() > 59) return false
      if (g[8] != "Z" && (g[9].toInt() > 23 || g[10].toInt() > 59)) return false
      return true
    }

    private fun daysIn(year: Int, month: Int): Int =
      when (month) {
        2 -> if (year % 4 == 0 && (year % 100 != 0 || year % 400 == 0)) 29 else 28
        4, 6, 9, 11 -> 30
        else -> 31
      }
  }
}
