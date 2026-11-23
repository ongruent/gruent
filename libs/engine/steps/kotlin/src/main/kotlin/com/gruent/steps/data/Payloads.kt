package com.gruent.steps.data

import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import java.nio.ByteBuffer
import java.nio.charset.CharacterCodingException
import java.nio.charset.CodingErrorAction

/** Helpers for step payloads, which carry JSON when the step's input has a model. */
object Payloads {
  /** Decodes strict UTF-8, or returns null. */
  fun decodeUtf8(payload: ByteArray): String? = try {
    Charsets.UTF_8.newDecoder()
      .onMalformedInput(CodingErrorAction.REPORT)
      .onUnmappableCharacter(CodingErrorAction.REPORT)
      .decode(ByteBuffer.wrap(payload))
      .toString()
  } catch (_: CharacterCodingException) {
    null
  }

  /** Parses a payload as a JSON value, or returns null if it is not JSON. */
  fun parseJson(payload: ByteArray): JsonElement? {
    val text = decodeUtf8(payload) ?: return null
    if (text.isBlank()) return null
    return try {
      Json.parseToJsonElement(text).takeUnless {
        // The parser accepts bare words such as `hello`; the only unquoted JSON values are numbers,
        // booleans and null.
        it is JsonPrimitive && !it.isString && it.content !in setOf("true", "false", "null") && it.content.toBigDecimalOrNull() == null
      }
    } catch (_: SerializationException) {
      null
    } catch (_: IllegalArgumentException) {
      null
    }
  }
}

/**
 * A field path in variable syntax, relative to a step's input: `a.b` descends into objects and `a[].b` into
 * every item of an array (`a[][]` into nested arrays). Paths are the ones the controller lists for models
 * (e.g. redaction and existence paths) and the ones users write in templates without the `input.` prefix.
 */
class FieldPath private constructor(val segments: List<Segment>) {
  data class Segment(val name: String, val arrayDepth: Int)

  override fun toString(): String = segments.joinToString(".") { it.name + "[]".repeat(it.arrayDepth) }

  /** Whether the path descends into an array, so that it can match several values. */
  val isMultiValued: Boolean get() = segments.any { it.arrayDepth > 0 }

  /**
   * Every value at this path. A path through an array yields the value of every item; an item without
   * the field yields nothing for that item. Use [missing] to check presence.
   */
  fun values(root: JsonElement): List<JsonElement> {
    var current = listOf(root)
    for (segment in segments) {
      current = current.mapNotNull { (it as? JsonObject)?.get(segment.name) }
      repeat(segment.arrayDepth) {
        current = current.flatMap { (it as? JsonArray) ?: emptyList() }
      }
    }
    return current
  }

  /**
   * Whether the field is missing in [root]. A path through an array is present when the array is present
   * and every item has the field (an empty array has no items that lack it). With [nullIsMissing], a null
   * value, including a null array or item on the way, counts as missing.
   */
  fun missing(root: JsonElement, nullIsMissing: Boolean): Boolean = missing(root, segments, nullIsMissing)

  private fun missing(element: JsonElement, rest: List<Segment>, nullIsMissing: Boolean): Boolean {
    if (rest.isEmpty()) return nullIsMissing && element is JsonNull
    val segment = rest.first()
    val obj = element as? JsonObject ?: return true
    val child = obj[segment.name] ?: return true
    return missingItems(child, segment.arrayDepth, rest.drop(1), nullIsMissing)
  }

  private fun missingItems(element: JsonElement, depth: Int, rest: List<Segment>, nullIsMissing: Boolean): Boolean {
    if (depth == 0) return missing(element, rest, nullIsMissing)
    if (element is JsonNull) return nullIsMissing || rest.isNotEmpty()
    val array = element as? JsonArray ?: return true
    return array.any { missingItems(it, depth - 1, rest, nullIsMissing) }
  }

  companion object {
    private val name = Regex("^[^.\\[\\]\\s]+$")

    /** Parses a path, or throws [IllegalArgumentException]. */
    fun parse(path: String): FieldPath {
      require(path.isNotEmpty()) { "empty field path" }
      return FieldPath(
        path.split('.').map { raw ->
          var segment = raw
          var depth = 0
          while (segment.endsWith("[]")) {
            segment = segment.removeSuffix("[]")
            depth++
          }
          require(name.matches(segment)) { "invalid field path $path" }
          Segment(segment, depth)
        },
      )
    }
  }
}
