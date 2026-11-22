package com.gruent.steps.plugins.relationaldb.v1

import com.gruent.steps.api.ExecutionContext
import com.gruent.steps.api.LogLevel
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
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.sql.DriverManager
import java.util.Properties

/**
 * Runs a parameterized statement against one database engine. Each engine (Postgres today; MySQL, MSSQL and
 * others later) is a driver, so the step itself stays engine-independent.
 */
interface RelationalDriver : AutoCloseable {
  /** Executes [statement] with [parameters] bound in order, and returns the number of affected rows. */
  fun execute(statement: String, parameters: List<Any?>): Int

  override fun close() {}
}

/** Postgres over JDBC. Parameters are bound with a PreparedStatement, never spliced into the SQL. */
class PostgresDriver(private val url: String, private val properties: Properties) : RelationalDriver {
  override fun execute(statement: String, parameters: List<Any?>): Int =
    DriverManager.getConnection(url, properties).use { connection ->
      // The controller compiles placeholders into $1, $2, ...; JDBC binds positional ? markers.
      connection.prepareStatement(statement.replace(Regex("\\$(\\d+)"), "?")).use { prepared ->
        val order = Regex("\\$(\\d+)").findAll(statement).map { it.groupValues[1].toInt() - 1 }.toList()
        order.forEachIndexed { index, parameter -> prepared.setObject(index + 1, parameters[parameter]) }
        prepared.executeUpdate().coerceAtLeast(0)
      }
    }

  companion object {
    fun fromConnection(attributes: String): PostgresDriver {
      val obj = Json.parseToJsonElement(attributes).jsonObject
      fun attribute(name: String) = obj[name]?.jsonPrimitive?.content
      val host = attribute("host") ?: throw IllegalArgumentException("the connection has no host")
      val database = attribute("database") ?: throw IllegalArgumentException("the connection has no database")
      val port = attribute("port") ?: "5432"
      val properties = Properties().apply {
        attribute("username")?.let { setProperty("user", it) }
        attribute("password")?.let { setProperty("password", it) }
        setProperty("sslmode", attribute("sslMode") ?: "prefer")
      }
      return PostgresDriver("jdbc:postgresql://$host:$port/$database", properties)
    }
  }
}

/** Creates `relational-db@1` steps. */
class RelationalDbStepFactory(
  private val drivers: Map<String, (String) -> RelationalDriver> = mapOf(ENGINE_POSTGRES to PostgresDriver::fromConnection),
) : StepFactory {
  override val pluginType: String = RelationalDbConfig.pluginType
  override val pluginVersion: Int = RelationalDbConfig.pluginVersion
  override val definitionDigest: String = RelationalDbConfig.definitionDigest
  override val category: StepCategory = StepCategory.ACTION

  override fun create(spec: StepSpec): Step {
    val config = try {
      RelationalDbConfig.decode(spec.configJson)
    } catch (e: ConfigValidationException) {
      throw StepConfigurationException("invalid configuration for step ${spec.stepId}: ${e.message}", e)
    }
    val compiled = spec.compiledJson?.let { Json.parseToJsonElement(it).jsonObject }
      ?: throw StepConfigurationException("step ${spec.stepId} has no compiled statement in the plan")
    val statement = compiled.getValue("statement").jsonPrimitive.content
    val parameters = compiled.getValue("parameters").jsonArray.map {
      it.jsonPrimitive.content.let { path -> if (path.isEmpty()) FieldPath.parseVariable("input") else FieldPath.parse(path) }
    }
    val driver = drivers[config.engine.value]
      ?: throw StepConfigurationException("step ${spec.stepId} uses ${config.engine.value}, which this runtime does not support")
    val connection = spec.connections[config.connectionId]
      ?: throw StepConfigurationException("connection ${config.connectionId} of step ${spec.stepId} is not hydrated")
    return RelationalDbStep(statement, parameters, driver(connection))
  }

  companion object {
    const val ENGINE_POSTGRES = "POSTGRES_SERVER"
  }
}

/**
 * Runs the compiled statement once per input. The controller turned every `{{input.*}}` of the configured
 * statement into a bound parameter; this step reads those values from the JSON input and binds them, so
 * input values can never change the SQL. A missing value is bound as NULL. The input passes through.
 */
class RelationalDbStep(
  private val statement: String,
  private val parameters: List<FieldPath>,
  private val driver: RelationalDriver,
) : MessageStep() {
  override suspend fun process(message: StepMessage, context: ExecutionContext, emit: suspend (StepMessage) -> Unit) {
    val input = if (parameters.isEmpty()) JsonNull else Payloads.parseJson(message.payload)
      ?: throw IllegalArgumentException("the input is not JSON, so the statement's input values can't be read")
    val values = parameters.map { path -> bindable(path.values(input).singleOrNull()) }
    val rows = withContext(Dispatchers.IO) { driver.execute(statement, values) }
    context.logger.log(LogLevel.DEBUG, "Statement executed", mapOf("rows" to rows.toString()))
    emit(message)
  }

  override suspend fun close() = driver.close()

  private fun bindable(value: JsonElement?): Any? = when {
    value == null || value is JsonNull -> null
    value is JsonPrimitive && value.isString -> value.content
    value is JsonPrimitive -> value.booleanOrNull ?: value.content.toBigDecimal()
    else -> value.toString() // objects and arrays are bound as JSON text
  }
}
