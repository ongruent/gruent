package com.gruent.runtime.artifacts

import java.io.IOException
import java.net.URI
import java.net.URLEncoder
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.nio.file.Files
import java.nio.file.Path
import java.security.MessageDigest
import java.time.Clock
import java.time.Duration
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/** Read access to the artifact file storage that the controller uploads plans to. */
interface ArtifactStore {
  /** Returns the object at [key], or null if it does not exist. */
  fun get(key: String): ByteArray?
}

/** Artifacts in a local directory, laid out by storage key. For local runs and tests. */
class DirectoryArtifactStore(private val root: Path) : ArtifactStore {
  override fun get(key: String): ByteArray? {
    val path = root.resolve(key).normalize()
    require(path.startsWith(root.normalize())) { "artifact key $key escapes the storage directory" }
    return if (Files.isRegularFile(path)) Files.readAllBytes(path) else null
  }
}

/**
 * Artifacts in an S3-compatible bucket (MinIO locally), read with path-style requests signed with AWS
 * Signature Version 4. Only GetObject is needed, so the runtime doesn't depend on an S3 SDK.
 */
class S3ArtifactStore(
  private val endpoint: URI,
  private val bucket: String,
  private val region: String,
  private val accessKeyId: String,
  private val secretAccessKey: String,
  private val clock: Clock = Clock.systemUTC(),
  private val http: HttpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build(),
) : ArtifactStore {
  override fun get(key: String): ByteArray? {
    val path = "/" + encodePath(bucket) + "/" + key.split('/').joinToString("/") { encodePath(it) }
    val headers = signedHeaders("GET", path, "")
    val request = HttpRequest.newBuilder(URI("${endpoint.scheme}://${endpoint.rawAuthority}$path"))
      .timeout(Duration.ofSeconds(30))
      .GET()
      .apply { headers.forEach { (name, value) -> if (name != "host") header(name, value) } }
      .build()
    val response = http.send(request, HttpResponse.BodyHandlers.ofByteArray())
    return when (response.statusCode()) {
      200 -> response.body()
      404 -> null
      else -> throw IOException("GET $key from bucket $bucket failed with status ${response.statusCode()}: ${response.body().decodeToString().take(500)}")
    }
  }

  /** Returns the headers of a SigV4-signed request with an empty body, including "host". */
  internal fun signedHeaders(
    method: String,
    canonicalPath: String,
    canonicalQuery: String,
    extraHeaders: Map<String, String> = emptyMap(),
  ): Map<String, String> {
    val now = clock.instant().atOffset(ZoneOffset.UTC)
    val amzDate = DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss'Z'").format(now)
    val date = amzDate.substring(0, 8)
    val payloadHash = hex(sha256(ByteArray(0)))
    val host = endpoint.rawAuthority

    val headers = sortedMapOf(
      "host" to host,
      "x-amz-content-sha256" to payloadHash,
      "x-amz-date" to amzDate,
    )
    extraHeaders.forEach { (name, value) -> headers[name.lowercase()] = value }
    val signedHeaderNames = headers.keys.joinToString(";")
    val canonicalRequest = listOf(
      method,
      canonicalPath,
      canonicalQuery,
      headers.entries.joinToString("") { "${it.key}:${it.value.trim()}\n" },
      signedHeaderNames,
      payloadHash,
    ).joinToString("\n")

    val scope = "$date/$region/s3/aws4_request"
    val stringToSign = listOf("AWS4-HMAC-SHA256", amzDate, scope, hex(sha256(canonicalRequest.toByteArray()))).joinToString("\n")
    var signingKey = hmac("AWS4$secretAccessKey".toByteArray(), date)
    signingKey = hmac(signingKey, region)
    signingKey = hmac(signingKey, "s3")
    signingKey = hmac(signingKey, "aws4_request")
    val signature = hex(hmac(signingKey, stringToSign))

    return headers + ("authorization" to "AWS4-HMAC-SHA256 Credential=$accessKeyId/$scope, SignedHeaders=$signedHeaderNames, Signature=$signature")
  }

  companion object {
    /** URI-encodes a path segment as SigV4 requires: everything except unreserved characters. */
    internal fun encodePath(segment: String): String =
      URLEncoder.encode(segment, Charsets.UTF_8).replace("+", "%20").replace("*", "%2A").replace("%7E", "~")

    private fun sha256(data: ByteArray): ByteArray = MessageDigest.getInstance("SHA-256").digest(data)

    private fun hmac(key: ByteArray, data: String): ByteArray =
      Mac.getInstance("HmacSHA256").apply { init(SecretKeySpec(key, "HmacSHA256")) }.doFinal(data.toByteArray())

    private fun hex(bytes: ByteArray): String = bytes.joinToString("") { "%02x".format(it) }
  }
}
