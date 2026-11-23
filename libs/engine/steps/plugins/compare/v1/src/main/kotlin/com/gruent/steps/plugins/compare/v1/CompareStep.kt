package com.gruent.steps.plugins.compare.v1

import com.gruent.steps.api.ConditionalStep
import com.gruent.steps.api.ExecutionContext
import com.gruent.steps.api.LogLevel
import com.gruent.steps.api.Step
import com.gruent.steps.api.StepCategory
import com.gruent.steps.api.StepConfigurationException
import com.gruent.steps.api.StepFactory
import com.gruent.steps.api.StepMessage
import com.gruent.steps.api.StepSpec
import com.gruent.steps.config.ConfigValidationException
import com.gruent.steps.data.FieldPath
import com.gruent.steps.data.Payloads
import com.gruent.steps.plugins.compare.v1.CompareConfig.ComparisonsItem
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import java.math.BigDecimal

/** Creates `compare@1` steps. */
class CompareStepFactory : StepFactory {
  override val pluginType: String = CompareConfig.pluginType
  override val pluginVersion: Int = CompareConfig.pluginVersion
  override val definitionDigest: String = CompareConfig.definitionDigest
  override val category: StepCategory = StepCategory.CONDITIONAL

  override fun create(spec: StepSpec): Step {
    val config = try {
      CompareConfig.decode(spec.configJson)
    } catch (e: ConfigValidationException) {
      throw StepConfigurationException("invalid configuration for step ${spec.stepId}: ${e.message}", e)
    }
    fun invalid(message: String): Nothing = throw StepConfigurationException("invalid configuration for step ${spec.stepId}: $message")

    // The controller compiles the type of each comparison from the model's fields.
    val types = valueTypes(spec)
    if (types.size != config.comparisons.size) {
      invalid("the plan has ${types.size} compiled value types for ${config.comparisons.size} comparisons")
    }
    val comparisons = config.comparisons.mapIndexed { index, comparison ->
      val n = index + 1
      val type = types[index]
      val left = try {
        FieldPath.parse(comparison.left)
      } catch (e: IllegalArgumentException) {
        invalid("comparison $n: left: ${e.message}")
      }
      val right: Operand = when (comparison.compareTo) {
        ComparisonsItem.CompareTo.VALUE -> {
          val raw = comparison.value ?: invalid("comparison $n: value is required when comparing to a fixed value")
          Operand.Fixed(parseValue(type, raw) ?: invalid("comparison $n: value \"$raw\" is not a ${type.value}"))
        }
        ComparisonsItem.CompareTo.VARIABLE -> {
          val field = comparison.right ?: invalid("comparison $n: right is required when comparing to another field")
          try {
            Operand.Variable(FieldPath.parse(field))
          } catch (e: IllegalArgumentException) {
            invalid("comparison $n: right: ${e.message}")
          }
        }
      }
      if (type != ValueType.NUMBER && comparison.operator !in EQUALITY) {
        invalid("comparison $n: ${comparison.operator.value} compares numbers, but ${comparison.left} is a ${type.value}")
      }
      Comparison(type, left, comparison.operator, right)
    }
    return CompareStep(comparisons, config.match)
  }

  private fun valueTypes(spec: StepSpec): List<ValueType> {
    val compiled = spec.compiledJson
      ?: throw StepConfigurationException("step ${spec.stepId} has no compiled value types in the plan")
    return try {
      val obj = Json.parseToJsonElement(compiled) as JsonObject
      (obj.getValue(COMPILED_VALUE_TYPES) as JsonArray).map { element ->
        val name = (element as JsonPrimitive).content
        ValueType.entries.firstOrNull { it.value == name } ?: throw IllegalArgumentException("unknown value type \"$name\"")
      }
    } catch (e: Exception) {
      when (e) {
        is SerializationException, is ClassCastException, is NoSuchElementException, is IllegalArgumentException ->
          throw StepConfigurationException("step ${spec.stepId} has invalid compiled value types: ${e.message}", e)
        else -> throw e
      }
    }
  }

  companion object {
    /** The plan step's `compiled.valueTypes`: the type of each comparison's values, in configuration order. */
    const val COMPILED_VALUE_TYPES = "valueTypes"

    val EQUALITY = setOf(ComparisonsItem.Operator.EQUAL, ComparisonsItem.Operator.NOTEQUAL)

    /** Parses a fixed value of [type], or returns null. */
    fun parseValue(type: ValueType, raw: String): Value? = when (type) {
      ValueType.NUMBER -> raw.trim().toBigDecimalOrNull()?.let { Value.Number(it) }
      ValueType.STRING -> Value.Text(raw)
      ValueType.BOOLEAN -> raw.trim().lowercase().toBooleanStrictOrNull()?.let { Value.Bool(it) }
    }
  }
}

/** The type of both values of a comparison, from the type of the model field. */
enum class ValueType(val value: String) {
  NUMBER("number"),
  STRING("string"),
  BOOLEAN("boolean"),
}

/** A typed value being compared. */
sealed interface Value {
  data class Number(val value: BigDecimal) : Value
  data class Text(val value: String) : Value
  data class Bool(val value: Boolean) : Value
}

/** The right-hand side of a comparison. */
sealed interface Operand {
  data class Fixed(val value: Value) : Operand
  data class Variable(val path: FieldPath) : Operand
}

/** One comparison: a field of the input with a fixed value or another field, both of [type]. */
data class Comparison(
  val type: ValueType,
  val left: FieldPath,
  val operator: ComparisonsItem.Operator,
  val right: Operand,
)

/**
 * Compares fields of the input with fixed values or other fields (ported from the legacy threshold and
 * string compare nodes, which also combined several conditions with AND or OR).
 *
 * With `match: all` every comparison must hold, with `any` at least one. Both values of a comparison must
 * have its type: numbers compare numerically (so 25 equals 25.0), text and booleans by equality. A value
 * that is missing, null, of another type, or that matches several values makes its comparison not hold
 * rather than failing the execution. Signals and input that isn't JSON fail the condition.
 */
class CompareStep(
  private val comparisons: List<Comparison>,
  private val match: CompareConfig.Match,
) : ConditionalStep() {
  override suspend fun evaluate(message: StepMessage, context: ExecutionContext): Boolean {
    if (message.kind == StepMessage.Kind.SIGNAL) {
      context.logger.log(LogLevel.WARN, "Input is a signal without values", emptyMap())
      return false
    }
    val input = Payloads.parseJson(message.payload)
    if (input == null) {
      context.logger.log(LogLevel.WARN, "Input is not JSON", emptyMap())
      return false
    }
    val holds = { index: Int -> holds(input, index, context) }
    val pass = when (match) {
      CompareConfig.Match.ALL -> comparisons.indices.all(holds)
      CompareConfig.Match.ANY -> comparisons.indices.any(holds)
    }
    context.logger.log(
      LogLevel.DEBUG,
      if (pass) "Condition holds" else "Condition does not hold",
      mapOf(ATTRIBUTE_RESULT to if (pass) StepMessage.PORT_SUCCESS else StepMessage.PORT_FAILURE),
    )
    return pass
  }

  private fun holds(input: JsonElement, index: Int, context: ExecutionContext): Boolean {
    val comparison = comparisons[index]
    val left = resolve(input, comparison, comparison.left, "left", index, context) ?: return false
    val right = when (val operand = comparison.right) {
      is Operand.Fixed -> operand.value
      is Operand.Variable -> resolve(input, comparison, operand.path, "right", index, context) ?: return false
    }
    return compare(left, comparison.operator, right)
  }

  private fun resolve(input: JsonElement, comparison: Comparison, path: FieldPath, side: String, index: Int, context: ExecutionContext): Value? {
    val values = path.values(input)
    val value = values.singleOrNull()?.let { typed(it, comparison.type) }
    if (value == null) {
      val problem = when {
        values.isEmpty() -> "is missing"
        values.size > 1 -> "has several values"
        else -> "is not a ${comparison.type.value}"
      }
      context.logger.log(
        LogLevel.WARN,
        "Input value $problem",
        mapOf(ATTRIBUTE_COMPARISON to (index + 1).toString(), ATTRIBUTE_SIDE to side, ATTRIBUTE_PATH to path.toString()),
      )
    }
    return value
  }

  private fun typed(element: JsonElement, type: ValueType): Value? {
    val primitive = element as? JsonPrimitive ?: return null
    return when (type) {
      ValueType.NUMBER -> if (primitive.isString) null else primitive.content.toBigDecimalOrNull()?.let { Value.Number(it) }
      ValueType.STRING -> if (primitive.isString) Value.Text(primitive.content) else null
      ValueType.BOOLEAN -> if (primitive.isString) null else primitive.content.toBooleanStrictOrNull()?.let { Value.Bool(it) }
    }
  }

  private fun compare(left: Value, operator: ComparisonsItem.Operator, right: Value): Boolean {
    if (left is Value.Number && right is Value.Number) {
      val order = left.value.compareTo(right.value)
      return when (operator) {
        ComparisonsItem.Operator.EQUAL -> order == 0
        ComparisonsItem.Operator.NOTEQUAL -> order != 0
        ComparisonsItem.Operator.GREATERTHAN -> order > 0
        ComparisonsItem.Operator.GREATERTHANOREQUAL -> order >= 0
        ComparisonsItem.Operator.LESSTHAN -> order < 0
        ComparisonsItem.Operator.LESSTHANOREQUAL -> order <= 0
      }
    }
    return when (operator) {
      ComparisonsItem.Operator.EQUAL -> left == right
      ComparisonsItem.Operator.NOTEQUAL -> left != right
      else -> false // rejected by the factory
    }
  }

  companion object {
    const val ATTRIBUTE_RESULT = "result"
    const val ATTRIBUTE_COMPARISON = "comparison"
    const val ATTRIBUTE_SIDE = "side"
    const val ATTRIBUTE_PATH = "path"
  }
}
