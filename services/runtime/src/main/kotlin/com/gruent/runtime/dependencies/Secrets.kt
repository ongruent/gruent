package com.gruent.runtime.dependencies

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import java.io.IOException
import java.net.URI
import java.net.URLEncoder
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration

/**
 * A reference to a secret in a space's key-value secrets, `secretref://vault/spaces/<space ID>#<key>`
 * (`compiler.SecretRef` in the controller). The key is the secret's name in the space.
 */
data class SecretRef(val spaceId: String, val key: String) {
  override fun toString() = "$PREFIX$spaceId#$key"

  companion object {
    private const val PREFIX = "secretref://vault/spaces/"

    fun parse(ref: String): SecretRef {
      val separator = ref.indexOf('#')
      require(ref.startsWith(PREFIX) && separator > PREFIX.length && separator < ref.length - 1) {
        "unsupported secret reference $ref"
      }
      val spaceId = ref.substring(PREFIX.length, separator)
      require(!spaceId.contains('/')) { "unsupported secret reference $ref" }
      return SecretRef(spaceId, ref.substring(separator + 1))
    }
  }
}

/** Thrown when a secret can't be resolved: it doesn't exist, or the secret store refused or failed. */
class SecretResolutionException(message: String, cause: Throwable? = null) : Exception(message, cause)

/** Resolves secret references to their values. Values are never written to storage or logs. */
fun interface SecretResolver {
  fun resolve(ref: SecretRef): String
}

/**
 * Reads a space's secrets from the Vault KV (v1) engine that the API writes them to: one entry per space at
 * `<mount>/spaces/<space ID>`, with one key per secret name (see libs/secrets). Each space is read once.
 *
 * The worker authenticates with a token, or with userpass credentials that it exchanges for a token on the
 * first read. Its Vault policy only needs `read` on the spaces path of the mount.
 */
class VaultSecretResolver(
  private val address: URI,
  private val auth: Auth,
  private val mount: String = "kv",
  private val http: HttpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build(),
) : SecretResolver {
  sealed interface Auth {
    data class Token(val token: String) : Auth {
      override fun toString() = "Token(***)"
    }

    data class UserPass(val username: String, val password: String) : Auth {
      override fun toString() = "UserPass($username, ***)"
    }
  }

  private var token: String? = (auth as? Auth.Token)?.token
  private val spaces = mutableMapOf<String, JsonObject>()

  @Synchronized
  override fun resolve(ref: SecretRef): String {
    val secrets = spaces.getOrPut(ref.spaceId) { readSpace(ref.spaceId) }
    val value = secrets[ref.key] ?: throw SecretResolutionException("secret ${ref.key} does not exist in space ${ref.spaceId}")
    return (value as? JsonPrimitive)?.content ?: value.toString()
  }

  private fun readSpace(spaceId: String): JsonObject {
    val response = send(request("/v1/$mount/spaces/${encode(spaceId)}").header(TOKEN_HEADER, token()).GET().build())
    return when (response.statusCode()) {
      200 -> Json.parseToJsonElement(response.body()).jsonObject["data"]?.jsonObject ?: JsonObject(emptyMap())
      // The API only writes a space's entry once it has a secret.
      404 -> JsonObject(emptyMap())
      else -> throw SecretResolutionException("reading the secrets of space $spaceId from Vault failed with status ${response.statusCode()}")
    }
  }

  private fun token(): String = token ?: login().also { token = it }

  private fun login(): String {
    val userPass = auth as Auth.UserPass
    val body = buildJsonObject { put("password", userPass.password) }.toString()
    val response = send(
      request("/v1/auth/userpass/login/${encode(userPass.username)}")
        .header("Content-Type", "application/json")
        .POST(HttpRequest.BodyPublishers.ofString(body))
        .build(),
    )
    if (response.statusCode() != 200) {
      throw SecretResolutionException("logging in to Vault as ${userPass.username} failed with status ${response.statusCode()}")
    }
    return Json.parseToJsonElement(response.body()).jsonObject["auth"]?.jsonObject?.get("client_token")?.jsonPrimitive?.content
      ?: throw SecretResolutionException("Vault's login response has no token")
  }

  private fun request(path: String) = HttpRequest.newBuilder(address.resolve(path)).timeout(Duration.ofSeconds(30))

  private fun send(request: HttpRequest): HttpResponse<String> = try {
    http.send(request, HttpResponse.BodyHandlers.ofString())
  } catch (e: IOException) {
    throw SecretResolutionException("could not reach Vault at $address: ${e.message}", e)
  }

  private fun encode(segment: String) = URLEncoder.encode(segment, Charsets.UTF_8).replace("+", "%20")

  companion object {
    private const val TOKEN_HEADER = "X-Vault-Token"
  }
}
