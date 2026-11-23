package com.gruent.steps.data

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonPrimitive
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows

class FieldPathTest {
  private val input = Json.parseToJsonElement(
    """{"device":{"id":"d1","name":null},"readings":[{"value":1},{"value":2}],"empty":[],"partial":[{"value":1},{}]}""",
  )

  @Test
  fun `nested and array fields are present`() {
    assertFalse(FieldPath.parse("device.id").missing(input, nullIsMissing = true))
    assertFalse(FieldPath.parse("readings[].value").missing(input, nullIsMissing = true))
    assertFalse(FieldPath.parse("empty[].value").missing(input, nullIsMissing = true))
  }

  @Test
  fun `missing fields, items without the field and nulls`() {
    assertTrue(FieldPath.parse("device.serial").missing(input, nullIsMissing = true))
    assertTrue(FieldPath.parse("partial[].value").missing(input, nullIsMissing = true))
    assertTrue(FieldPath.parse("device.name").missing(input, nullIsMissing = true))
    assertFalse(FieldPath.parse("device.name").missing(input, nullIsMissing = false))
    assertTrue(FieldPath.parse("device.id.more").missing(input, nullIsMissing = false))
  }

  @Test
  fun `values collects every item`() {
    assertEquals(listOf(JsonPrimitive(1), JsonPrimitive(2)), FieldPath.parse("readings[].value").values(input))
    assertEquals(listOf(JsonPrimitive("d1")), FieldPath.parse("device.id").values(input))
    assertTrue(FieldPath.parse("readings[].value").isMultiValued)
  }

  @Test
  fun `variables are relative to the input`() {
    assertEquals(listOf(input), FieldPath.parseVariable("input").values(input))
    assertEquals(listOf(JsonPrimitive("d1")), FieldPath.parseVariable("input.device.id").values(input))
    assertThrows<IllegalArgumentException> { FieldPath.parseVariable("device.id") }
  }

  @Test
  fun `invalid paths are rejected`() {
    assertThrows<IllegalArgumentException> { FieldPath.parse("a..b") }
    assertThrows<IllegalArgumentException> { FieldPath.parse("") }
  }

  @Test
  fun `payloads parse as JSON only when they are JSON`() {
    assertNull(Payloads.parseJson("hello".toByteArray()))
    assertEquals(JsonPrimitive(1), Payloads.parseJson("1".toByteArray()))
    assertNull(Payloads.parseJson(byteArrayOf(0xC3.toByte())))
  }
}
