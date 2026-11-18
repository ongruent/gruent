package com.gruent.nodes.config

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.DynamicTest
import org.junit.jupiter.api.TestFactory
import java.io.File
import java.security.MessageDigest

/**
 * Runs every plugin's shared fixtures (the same files the Go and TypeScript suites use) through the generated
 * Kotlin validators, and checks that each generated class resolves to the exact identity and definition
 * digest recorded in generated/manifest.json.
 */
class SharedFixturesTest {
  private val root = File(System.getProperty("nodes.root") ?: "..")
  private val manifest = Json.parseToJsonElement(root.resolve("generated/manifest.json").readText()).jsonObject

  private fun plugins(): List<Pair<JsonObject, NodeConfigDefinition<Any>>> =
    manifest.getValue("plugins").jsonArray.map { it.jsonObject }.map { entry ->
      val kotlin = entry.getValue("kotlin").jsonObject
      val cls = Class.forName(kotlin.str("package") + "." + kotlin.str("class"))
      @Suppress("UNCHECKED_CAST")
      entry to (cls.getField("Definition").get(null) as NodeConfigDefinition<Any>)
    }

  @TestFactory
  fun identityMatchesManifest(): List<DynamicTest> =
    plugins().map { (entry, def) ->
      DynamicTest.dynamicTest("${entry.str("pluginType")}@${entry.getValue("pluginVersion")}") {
        val definition = entry.getValue("definition").jsonObject
        val bytes = root.resolve(definition.str("path")).readBytes()
        assertEquals(entry.str("pluginType"), def.pluginType)
        assertEquals(entry.getValue("pluginVersion").jsonPrimitive.int, def.pluginVersion)
        assertEquals(entry.getValue("contractVersion").jsonPrimitive.int, def.contractVersion)
        assertEquals(definition.str("digest"), def.definitionDigest)
        assertEquals(sha256(bytes), def.definitionDigest, "generated Kotlin is stale; run nx run nodes:compile")
      }
    }

  @TestFactory
  fun fixtures(): List<DynamicTest> =
    plugins().flatMap { (entry, def) ->
      val dir = root.resolve(entry.getValue("definition").jsonObject.str("path")).parentFile.resolve("fixtures")
      dir.walkTopDown().filter { it.isFile && it.name.endsWith(".json") }.sorted().map { file ->
        DynamicTest.dynamicTest(file.relativeTo(root).path) {
          val fixture = Json.parseToJsonElement(file.readText()).jsonObject
          val config = fixture.getValue("config")
          val expected = (fixture["errors"] as? JsonArray)?.map { it.jsonPrimitive.content }?.toSortedSet() ?: sortedSetOf()
          val actual = def.validate(config).map { it.path }.toSortedSet()
          assertEquals(expected, actual, "violation paths: ${def.validate(config)}")
          if (file.parentFile.name == "valid") {
            val value = def.decode(config)
            assertEquals(value, def.decode(def.encode(value)), "encode/decode round trip")
          } else {
            assertThrows(ConfigValidationException::class.java) { def.decode(config) }
          }
        }
      }.toList()
    }

  @TestFactory
  fun dateTimeProfile(): List<DynamicTest> =
    mapOf(
      "2026-11-18T09:30:00Z" to true,
      "2024-02-29T23:59:59.999-08:00" to true,
      "2026-11-18t09:30:00Z" to false,
      "2026-11-18T09:30:00z" to false,
      "2026-11-18T09:30Z" to false,
      "2023-02-29T00:00:00Z" to false,
      "2026-11-18T24:00:00Z" to false,
      "2026-12-31T23:59:60Z" to false,
      "2026-11-18T09:30:00+24:00" to false,
    ).map { (s, ok) -> DynamicTest.dynamicTest(s) { assertEquals(ok, ConfigValidator.isDateTime(s)) } }

  @org.junit.jupiter.api.Test
  fun everyPluginHasFixtures() {
    assertTrue(plugins().isNotEmpty())
  }

  private fun JsonObject.str(key: String) = getValue(key).jsonPrimitive.content

  private fun sha256(bytes: ByteArray) =
    "sha256:" + MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
}
