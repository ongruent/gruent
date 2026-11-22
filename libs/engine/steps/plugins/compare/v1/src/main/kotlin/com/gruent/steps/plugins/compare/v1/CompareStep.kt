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
import kotlinx.serialization.json.JsonElement
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

    val left = try {
      FieldPath.parseVariable(config.left)
    } catch (e: IllegalArgumentException) {
      invalid("left: ${e.message}")
    }
    val right: Operand = when (config.compareTo) {
      CompareConfig.CompareTo.VALUE -> {
        val raw = config.value ?: invalid("value is required when comparing to a fixed value")
        Operand.Fixed(parseValue(config.valueType, raw) ?: invalid("value \"$raw\" is not a ${config.valueType.value}"))
      }
      CompareConfig.CompareTo.VARIABLE -> {
        val variable = config.right ?: invalid("right is required when comparing to another input value")
        try {
          Operand.Variable(FieldPath.parseVariable(variable))
        } catch (e: IllegalArgumentException) {
          invalid("right: ${e.message}")
        }
      }
    }
    if (config.valueType != CompareConfig.ValueType.NUMBER && config.operator !in EQUALITY) {
      invalid("${config.operator.value} compares numbers, but the type is ${config.valueType.value}")
    }
    return CompareStep(config.valueType, left, config.operator, right)
  }

  companion object {
    val EQUALITY = setOf(CompareConfig.Operator.EQUAL, CompareConfig.Operator.NOTEQUAL)

    /** Parses a fixed value of [type], or returns null. */
    fun parseValue(type: CompareConfig.ValueType, raw: String): Value? = when (type) {
      CompareConfig.ValueType.NUMBER -> raw.trim().toBigDecimalOrNull()?.let { Value.Number(it) }
      CompareConfig.ValueType.STRING -> Value.Text(raw)
      CompareConfig.ValueType.BOOLEAN -> raw.trim().lowercase().toBooleanStrictOrNull()?.let { Value.Bool(it) }
    }
  }
}

/** A typed value being compared. */
sealed interface Value {
  data class Number(val value: BigDecimal) : Value
  data class Text(val value: String) : Value
  data class Bool(val value: Boolean) : Value
}

/** The right-hand side of the comparison. */
sealed interface Operand {
  data class Fixed(val value: Value) : Operand
  data class Variable(val path: FieldPath) : Operand
}

/**
 * Compares a value of the input with a fixed value or another input value (ported from the legacy threshold
 * and string compare nodes, one comparison per step).
 *
 * Both values must have the configured type: numbers compare numerically (so 25 equals 25.0), text and
 * booleans by equality. A value that is missing, null, of another type, or that matches several values (a
 * path through an array) fails the condition rather than the execution. Signals and input that isn't JSON
 * fail it too.
 */
class CompareStep(
  private val type: CompareConfig.ValueType,
  private val left: FieldPath,
  private val operator: CompareConfig.Operator,
  private val right: Operand,
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
    val leftValue = resolve(input, left, "left", context) ?: return false
    val rightValue = when (right) {
      is Operand.Fixed -> right.value
      is Operand.Variable -> resolve(input, right.path, "right", context) ?: return false
    }
    val pass = compare(leftValue, rightValue)
    context.logger.log(
      LogLevel.DEBUG,
      if (pass) "Condition holds" else "Condition does not hold",
      mapOf(ATTRIBUTE_RESULT to if (pass) StepMessage.PORT_SUCCESS else StepMessage.PORT_FAILURE),
    )
    return pass
  }

  private fun resolve(input: JsonElement, path: FieldPath, side: String, context: ExecutionContext): Value? {
    val values = path.values(input)
    val value = values.singleOrNull()?.let { typed(it) }
    if (value == null) {
      val problem = when {
        values.isEmpty() -> "is missing"
        values.size > 1 -> "has several values"
        else -> "is not a ${type.value}"
      }
      context.logger.log(LogLevel.WARN, "Input value $problem", mapOf(ATTRIBUTE_SIDE to side, ATTRIBUTE_PATH to "input${if (path.segments.isEmpty()) "" else ".$path"}"))
    }
    return value
  }

  private fun typed(element: JsonElement): Value? {
    val primitive = element as? JsonPrimitive ?: return null
    return when (type) {
      CompareConfig.ValueType.NUMBER -> if (primitive.isString) null else primitive.content.toBigDecimalOrNull()?.let { Value.Number(it) }
      CompareConfig.ValueType.STRING -> if (primitive.isString) Value.Text(primitive.content) else null
      CompareConfig.ValueType.BOOLEAN -> if (primitive.isString) null else primitive.content.toBooleanStrictOrNull()?.let { Value.Bool(it) }
    }
  }

  private fun compare(left: Value, right: Value): Boolean {
    if (left is Value.Number && right is Value.Number) {
      val order = left.value.compareTo(right.value)
      return when (operator) {
        CompareConfig.Operator.EQUAL -> order == 0
        CompareConfig.Operator.NOTEQUAL -> order != 0
        CompareConfig.Operator.GREATERTHAN -> order > 0
        CompareConfig.Operator.GREATERTHANOREQUAL -> order >= 0
        CompareConfig.Operator.LESSTHAN -> order < 0
        CompareConfig.Operator.LESSTHANOREQUAL -> order <= 0
      }
    }
    return when (operator) {
      CompareConfig.Operator.EQUAL -> left == right
      CompareConfig.Operator.NOTEQUAL -> left != right
      else -> false // rejected by the factory
    }
  }

  companion object {
    const val ATTRIBUTE_RESULT = "result"
    const val ATTRIBUTE_SIDE = "side"
    const val ATTRIBUTE_PATH = "path"
  }
}
