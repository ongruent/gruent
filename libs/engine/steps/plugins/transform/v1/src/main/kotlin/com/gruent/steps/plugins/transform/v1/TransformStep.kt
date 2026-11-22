package com.gruent.steps.plugins.transform.v1

import com.gruent.steps.api.ExecutionContext
import com.gruent.steps.api.MessageStep
import com.gruent.steps.api.Step
import com.gruent.steps.api.StepCategory
import com.gruent.steps.api.StepConfigurationException
import com.gruent.steps.api.StepFactory
import com.gruent.steps.api.StepMessage
import com.gruent.steps.api.StepSpec
import com.gruent.steps.config.ConfigValidationException
import com.gruent.steps.data.FieldPath
import com.gruent.steps.data.Payloads
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/** Creates `transform@1` steps. */
class TransformStepFactory : StepFactory {
  override val pluginType: String = TransformConfig.pluginType
  override val pluginVersion: Int = TransformConfig.pluginVersion
  override val definitionDigest: String = TransformConfig.definitionDigest
  override val category: StepCategory = StepCategory.PROCESSING

  override fun create(spec: StepSpec): Step {
    try {
      TransformConfig.decode(spec.configJson)
    } catch (e: ConfigValidationException) {
      throw StepConfigurationException("invalid configuration for step ${spec.stepId}: ${e.message}", e)
    }
    // The controller parses and type-checks the rules against the models and compiles them into the plan.
    val compiled = spec.compiledJson
      ?: throw StepConfigurationException("step ${spec.stepId} has no compiled mapping rules in the plan")
    val rules = try {
      Json.parseToJsonElement(compiled).jsonObject.getValue("rules").jsonArray.map { parseRule(it.jsonObject) }
    } catch (e: Exception) {
      throw StepConfigurationException("step ${spec.stepId} has invalid compiled mapping rules: ${e.message}", e)
    }
    return TransformStep(rules)
  }

  private fun parseRule(rule: JsonObject): Rule {
    val source = rule.getValue("source").jsonObject
    val path = { value: JsonElement? -> value?.jsonPrimitive?.content.orEmpty().let { if (it.isEmpty()) FieldPath.parseVariable("input") else FieldPath.parse(it) } }
    val parsed = when (val kind = source.getValue("kind").jsonPrimitive.content) {
      "variable" -> Source.Variable(path(source["path"]))
      "value" -> Source.Fixed(source["value"] ?: JsonNull)
      "template" -> Source.Template(
        source.getValue("parts").jsonArray.map { part ->
          val obj = part.jsonObject
          if (obj.containsKey("path")) Part.Value(path(obj["path"])) else Part.Text(obj["text"]?.jsonPrimitive?.content.orEmpty())
        },
      )
      else -> throw IllegalArgumentException("unknown source kind $kind")
    }
    return Rule(FieldPath.parse(rule.getValue("target").jsonPrimitive.content), rule["required"]?.jsonPrimitive?.content == "true", parsed)
  }
}

/** A compiled mapping rule: the output field, whether the output model requires it, and its source. */
data class Rule(val target: FieldPath, val required: Boolean, val source: Source)

sealed interface Source {
  data class Variable(val path: FieldPath) : Source
  data class Fixed(val value: JsonElement) : Source
  data class Template(val parts: List<Part>) : Source
}

sealed interface Part {
  data class Text(val text: String) : Part
  data class Value(val path: FieldPath) : Part
}

/** Thrown when the input lacks a value that a required output field is mapped from. */
class TransformException(message: String) : Exception(message)

/**
 * Maps the JSON input to the shape of the output model with the controller-compiled rules (ported from the
 * legacy transform node, whose mapping went from input to output attribute IDs).
 *
 * Rules are applied in order to an empty object. A rule copies an input value, sets a fixed value, or
 * renders text with input values. A target through an array (`values[].c`) sets the field in the item with
 * the same index as each value of the source (`input.readings[].celsius`); an array target with a
 * multi-valued source gets the list of values. When an input value is missing, an optional field is left
 * out, and a required field fails the step, like the legacy node's invalid data.
 */
class TransformStep(private val rules: List<Rule>) : MessageStep() {
  override suspend fun process(message: StepMessage, context: ExecutionContext, emit: suspend (StepMessage) -> Unit) {
    val input = (if (message.kind == StepMessage.Kind.DATA) Payloads.parseJson(message.payload) else null)
      ?: throw TransformException("the input is not JSON")
    val output = transform(input)
    emit(StepMessage.data(output.toString().toByteArray(), "application/json"))
  }

  fun transform(input: JsonElement): JsonObject {
    var output: JsonElement = JsonObject(emptyMap())
    for (rule in rules) {
      val values: List<JsonElement> = when (val source = rule.source) {
        is Source.Fixed -> listOf(source.value)
        is Source.Variable -> source.path.values(input)
        is Source.Template -> render(source, input)?.let { listOf(JsonPrimitive(it)) } ?: emptyList()
      }
      val multi = (rule.source as? Source.Variable)?.path?.isMultiValued == true
      if (!multi && values.isEmpty()) {
        if (rule.required) throw TransformException("the input has no value for the required output field ${rule.target}")
        continue
      }
      output = when {
        rule.target.isMultiValued -> setItems(output, rule.target.segments, values)
        multi -> set(output, rule.target.segments, JsonArray(values))
        else -> set(output, rule.target.segments, values.single())
      }
    }
    return output as JsonObject
  }

  private fun render(template: Source.Template, input: JsonElement): String? = buildString {
    for (part in template.parts) {
      when (part) {
        is Part.Text -> append(part.text)
        is Part.Value -> {
          val value = part.path.values(input).singleOrNull() ?: return null
          append(if (value is JsonPrimitive) value.content else value.toString())
        }
      }
    }
  }

  /** Sets [value] at a path without arrays. */
  private fun set(element: JsonElement, segments: List<FieldPath.Segment>, value: JsonElement): JsonElement {
    if (segments.isEmpty()) return value
    val obj = element as? JsonObject ?: JsonObject(emptyMap())
    val name = segments.first().name
    return JsonObject(obj + (name to set(obj[name] ?: JsonObject(emptyMap()), segments.drop(1), value)))
  }

  /** Sets the field after the array segment of every item to the value with the same index. */
  private fun setItems(element: JsonElement, segments: List<FieldPath.Segment>, values: List<JsonElement>): JsonElement {
    val obj = element as? JsonObject ?: JsonObject(emptyMap())
    val segment = segments.first()
    val rest = segments.drop(1)
    if (segment.arrayDepth == 0) {
      return JsonObject(obj + (segment.name to setItems(obj[segment.name] ?: JsonObject(emptyMap()), rest, values)))
    }
    val existing = (obj[segment.name] as? JsonArray).orEmpty()
    val items = List(maxOf(existing.size, values.size)) { index ->
      val item = existing.getOrNull(index) ?: JsonObject(emptyMap())
      values.getOrNull(index)?.let { set(item, rest, it) } ?: item
    }
    return JsonObject(obj + (segment.name to JsonArray(items)))
  }
}
