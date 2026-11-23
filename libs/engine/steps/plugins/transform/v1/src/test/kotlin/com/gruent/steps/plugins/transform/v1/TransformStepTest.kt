package com.gruent.steps.plugins.transform.v1

import com.gruent.steps.api.StepConfigurationException
import com.gruent.steps.api.StepSpec
import kotlinx.serialization.json.Json
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows

class TransformStepTest {
  private val config = """{"outputModelId":"m2","mappings":[{"target":"x","source":"x"}]}"""

  private fun step(rules: String) =
    TransformStepFactory().create(StepSpec("map", "Map", "transform", 1, config, compiledJson = """{"outputModelRef":"m2","rules":[$rules]}""")) as TransformStep

  private fun transform(rules: String, input: String) = step(rules).transform(Json.parseToJsonElement(input)).toString()

  @Test
  fun `copies values, fixed values and templates`() {
    val rules = """
      {"target":"deviceId","required":true,"source":{"kind":"variable","path":"device.id"}},
      {"target":"location.lat","source":{"kind":"variable","path":"lat"}},
      {"target":"unit","source":{"kind":"value","value":"celsius"}},
      {"target":"label","source":{"kind":"template","parts":[{"text":"Device "},{"path":"device.id"},{"text":" ("},{"path":"lat"},{"text":")"}]}}
    """
    assertEquals(
      """{"deviceId":"d1","location":{"lat":47.1},"unit":"celsius","label":"Device d1 (47.1)"}""",
      transform(rules, """{"device":{"id":"d1"},"lat":47.1}"""),
    )
  }

  @Test
  fun `maps array items by index and collects values`() {
    val rules = """
      {"target":"values[].c","source":{"kind":"variable","path":"readings[].celsius"}},
      {"target":"values[].at","source":{"kind":"variable","path":"readings[].time"}},
      {"target":"all","source":{"kind":"variable","path":"readings[].celsius"}}
    """
    assertEquals(
      """{"values":[{"c":1,"at":"t1"},{"c":2,"at":"t2"}],"all":[1,2]}""",
      transform(rules, """{"readings":[{"celsius":1,"time":"t1"},{"celsius":2,"time":"t2"}]}"""),
    )
  }

  @Test
  fun `missing values leave optional fields out and fail required ones`() {
    assertEquals("{}", transform("""{"target":"lat","source":{"kind":"variable","path":"lat"}}""", "{}"))
    assertThrows<TransformException> { transform("""{"target":"lat","required":true,"source":{"kind":"variable","path":"lat"}}""", "{}") }
  }

  @Test
  fun `the plan must carry compiled rules`() {
    assertThrows<StepConfigurationException> { TransformStepFactory().create(StepSpec("map", "Map", "transform", 1, config)) }
  }
}
