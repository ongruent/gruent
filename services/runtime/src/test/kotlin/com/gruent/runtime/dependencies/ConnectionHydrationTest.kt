package com.gruent.runtime.dependencies

import com.gruent.runtime.CHANNEL_ID
import com.gruent.runtime.execution.ChannelGraph
import com.gruent.runtime.plan.Plan
import com.gruent.runtime.steps.StepRegistry
import com.gruent.runtime.timerToLogPlan
import com.gruent.runtime.timerToLogPlanJson
import com.gruent.steps.api.StepConfigurationException
import com.gruent.steps.plugins.relationaldb.v1.RelationalDbConfig
import com.gruent.steps.plugins.relationaldb.v1.RelationalDbStepFactory
import com.gruent.steps.plugins.relationaldb.v1.RelationalDriver
import com.sun.net.httpserver.HttpServer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import java.net.InetSocketAddress
import java.net.URI
import java.util.ServiceLoader
import java.util.concurrent.atomic.AtomicInteger

class ConnectionHydrationTest {
  /** A timer → log plan with a relational-db step on [connection], as the controller compiles it. */
  private fun relationalPlan(connection: String = "t6"): Plan = timerToLogPlan(
    timerToLogPlanJson(
      extraSteps = """,
        {
          "id": "db",
          "type": "action.relational-db",
          "version": "1",
          "name": "Insert",
          "definition": {"pluginType": "relational-db", "pluginVersion": 1, "digest": "${RelationalDbConfig.definitionDigest}"},
          "config": {"engine": "POSTGRES_SERVER", "connectionId": "$connection", "statement": "INSERT INTO ticks VALUES (now())"},
          "modelRefs": null,
          "connectionRefs": ["$connection"],
          "compiled": {"engine": "POSTGRES_SERVER", "statement": "INSERT INTO ticks VALUES (now())", "parameters": []}
        }""",
      extraEdges = """, {"from": "timer", "fromPort": "", "to": "db", "toPort": ""}""",
    ),
  )

  private fun bundle(vararg connections: String) = DependencyBundle.parse(
    """
    {
      "apiVersion": "gruent.com/v1",
      "kind": "DependencyBundle",
      "metadata": {"orgId": "org1", "spaceId": "space1", "channelId": "$CHANNEL_ID", "channelName": "Ticks"},
      "models": null,
      "connections": [${connections.joinToString(",")}],
      "secrets": null,
      "certificates": null
    }
    """.trimIndent().toByteArray(),
  )

  private val withPassword = """
    {"id": "t6", "name": "Warehouse", "category": "POSTGRES_SERVER", "revision": "sha256:t6",
     "attributes": {"database": "iot", "host": "postgres", "port": 5432, "sslMode": "disable", "username": "gruent"},
     "secretFields": {"password": "secretref://vault/spaces/space1#PG_PASSWORD"}, "certificateFields": {}}
  """
  private val withoutPassword = """
    {"id": "t7", "name": "Local", "category": "POSTGRES_SERVER", "revision": "sha256:t7",
     "attributes": {"database": "s2ZQnzc23QuBP6Jf", "host": "postgres", "port": 5432, "sslMode": "disable", "username": "gruent"},
     "secretFields": {}, "certificateFields": {}}
  """

  private fun attributes(json: String) = Json.parseToJsonElement(json).jsonObject

  @Test
  fun `connections are hydrated with their secrets resolved`() {
    val resolved = mutableListOf<SecretRef>()
    val connections = ConnectionHydrator.hydrate(relationalPlan(), bundle(withPassword, withoutPassword)) { ref ->
      resolved += ref
      "s3cret"
    }
    // Only the connections that steps reference are hydrated.
    assertEquals(setOf("t6"), connections.keys)
    val hydrated = attributes(connections.getValue("t6"))
    assertEquals("s3cret", hydrated.getValue("password").jsonPrimitive.content)
    assertEquals("postgres", hydrated.getValue("host").jsonPrimitive.content)
    assertEquals(listOf(SecretRef("space1", "PG_PASSWORD")), resolved)
  }

  @Test
  fun `connections without secrets don't need a secret store`() {
    val connections = ConnectionHydrator.hydrate(relationalPlan("t7"), bundle(withoutPassword), secrets = null)
    val hydrated = attributes(connections.getValue("t7"))
    assertFalse(hydrated.containsKey("password"))
    assertEquals("s2ZQnzc23QuBP6Jf", hydrated.getValue("database").jsonPrimitive.content)
  }

  @Test
  fun `plans without connections hydrate nothing`() {
    assertEquals(emptyMap<String, String>(), ConnectionHydrator.hydrate(timerToLogPlan(), bundle(), secrets = null))
  }

  @Test
  fun `connections that can't be hydrated fail the plan`() {
    val plan = relationalPlan()
    fun failure(bundle: DependencyBundle, secrets: SecretResolver? = SecretResolver { "x" }) =
      assertThrows<HydrationException> { ConnectionHydrator.hydrate(plan, bundle, secrets) }.message!!

    assertTrue(failure(bundle()).contains("not in the plan's dependency bundle"))
    assertTrue(failure(bundle(withPassword), secrets = null).contains("no secret store configured"))
    assertTrue(failure(bundle(withPassword)) { throw SecretResolutionException("secret PG_PASSWORD does not exist in space space1") }.contains("does not exist"))
    assertTrue(failure(bundle(withPassword.replace("spaces/space1#", "spaces/space2#"))).contains("another space"))
    assertTrue(failure(bundle(withPassword.replace("secretref://vault", "other://vault"))).contains("unsupported secret reference"))
    assertTrue(failure(bundle(withPassword.replace(""""category": "POSTGRES_SERVER",""", """"category": "X",""").replace(Regex(""""attributes": \{[^}]*\}"""), """"attributes": null"""))).contains("sensitive attributes"))
    assertTrue(failure(bundle(withPassword.replace(""""certificateFields": {}""", """"certificateFields": {"ca": "certref://spaces/space1/certificates/c1"}"""))).contains("certificates"))
  }

  @Test
  fun `relational steps are created with their hydrated connection`() {
    val received = mutableListOf<String>()
    val driver = object : RelationalDriver {
      override fun execute(statement: String, parameters: List<Any?>): Int = 1
    }
    val discovered = ServiceLoader.load(com.gruent.steps.api.StepFactory::class.java).filter { it.pluginType != RelationalDbConfig.pluginType }
    val registry = StepRegistry(discovered + RelationalDbStepFactory(mapOf(RelationalDbStepFactory.ENGINE_POSTGRES to { attributes -> received += attributes; driver })))
    val plan = relationalPlan()

    // Before hydration, the step can't be created (the reported deployment failure).
    val error = assertThrows<StepConfigurationException> { ChannelGraph.build(plan, registry) }
    assertTrue(error.message!!.contains("connection t6 of step db is not hydrated"))

    val connections = ConnectionHydrator.hydrate(plan, bundle(withPassword)) { "s3cret" }
    ChannelGraph.build(plan, registry, connections)
    assertEquals("s3cret", attributes(received.single()).getValue("password").jsonPrimitive.content)
  }

  @Test
  fun `vault secrets are read once per space with a userpass login`() {
    val logins = AtomicInteger()
    val reads = AtomicInteger()
    val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
    server.createContext("/v1/auth/userpass/login/runtime") { exchange ->
      logins.incrementAndGet()
      val ok = exchange.requestBody.readBytes().decodeToString().contains("\"password\":\"pw\"")
      val body = """{"auth": {"client_token": "tok"}}""".toByteArray()
      exchange.sendResponseHeaders(if (ok) 200 else 400, body.size.toLong())
      exchange.responseBody.use { it.write(body) }
    }
    server.createContext("/v1/kv/spaces/") { exchange ->
      reads.incrementAndGet()
      val (status, body) = when {
        exchange.requestHeaders.getFirst("X-Vault-Token") != "tok" -> 403 to "{}"
        exchange.requestURI.path == "/v1/kv/spaces/space1" -> 200 to """{"data": {"PG_PASSWORD": "s3cret", "OTHER": "x"}}"""
        else -> 404 to """{"errors": []}"""
      }
      val bytes = body.toByteArray()
      exchange.sendResponseHeaders(status, bytes.size.toLong())
      exchange.responseBody.use { it.write(bytes) }
    }
    server.start()
    try {
      val address = URI("http://127.0.0.1:${server.address.port}")
      val vault = VaultSecretResolver(address, VaultSecretResolver.Auth.UserPass("runtime", "pw"))
      assertEquals("s3cret", vault.resolve(SecretRef("space1", "PG_PASSWORD")))
      assertEquals("x", vault.resolve(SecretRef("space1", "OTHER")))
      assertThrows<SecretResolutionException> { vault.resolve(SecretRef("space1", "MISSING")) }
      assertThrows<SecretResolutionException> { vault.resolve(SecretRef("space2", "PG_PASSWORD")) }
      assertEquals(1, logins.get())
      assertEquals(2, reads.get())

      val badToken = VaultSecretResolver(address, VaultSecretResolver.Auth.Token("wrong"))
      assertTrue(assertThrows<SecretResolutionException> { badToken.resolve(SecretRef("space1", "PG_PASSWORD")) }.message!!.contains("403"))
    } finally {
      server.stop(0)
    }
  }

  @Test
  fun `secret references round trip`() {
    val ref = SecretRef.parse("secretref://vault/spaces/space1#PG_PASSWORD")
    assertEquals(SecretRef("space1", "PG_PASSWORD"), ref)
    assertEquals("secretref://vault/spaces/space1#PG_PASSWORD", ref.toString())
    assertThrows<IllegalArgumentException> { SecretRef.parse("secretref://vault/spaces/space1") }
    assertThrows<IllegalArgumentException> { SecretRef.parse("secretref://vault/spaces/a/b#k") }
  }
}
