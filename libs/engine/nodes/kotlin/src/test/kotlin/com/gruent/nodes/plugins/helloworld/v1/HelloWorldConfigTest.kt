package com.gruent.nodes.plugins.helloworld.v1

import com.gruent.nodes.config.ConfigValidationException
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows

/** How a plugin implementation uses its generated configuration type. */
class HelloWorldConfigTest {
  @Test
  fun decodesTypedConfiguration() {
    val config =
      HelloWorldConfig.decode(
        """{"greeting":"Hi","language":"fr","repeatCount":2.0,"thingIds":["a","b"],"modelId":"builtin:default"}""",
      )
    assertEquals("Hi", config.greeting)
    assertEquals(HelloWorldConfig.Language.FR, config.language)
    assertEquals(2L, config.repeatCount)
    assertEquals(listOf("a", "b"), config.thingIds)
    // Missing optional values stay null; defaults are only applied when a configuration is created.
    assertNull(config.uppercase)
  }

  @Test
  fun encodesWithoutNulls() {
    val json = HelloWorldConfig(greeting = "Hi", language = HelloWorldConfig.Language.EN, repeatCount = 1).toJson()
    assertEquals("""{"greeting":"Hi","language":"en","repeatCount":1}""", json)
  }

  @Test
  fun rejectsInvalidConfiguration() {
    val e = assertThrows<ConfigValidationException> { HelloWorldConfig.decode("""{"language":"de","repeatCount":0}""") }
    assertEquals(listOf("/greeting", "/language", "/repeatCount"), e.violations.map { it.path }.sorted())
    assertEquals("hello-world", e.pluginType)
    assertEquals(1, e.pluginVersion)
  }
}
