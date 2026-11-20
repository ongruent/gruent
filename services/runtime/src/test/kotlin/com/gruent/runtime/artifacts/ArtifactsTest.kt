package com.gruent.runtime.artifacts

import com.gruent.runtime.CHANNEL_ID
import com.gruent.runtime.timerToLogPlanJson
import kotlinx.serialization.json.Json
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.junit.jupiter.api.io.TempDir
import java.net.URI
import java.nio.file.Files
import java.nio.file.Path
import java.security.KeyPairGenerator
import java.security.Signature
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import java.util.Base64

class ArtifactsTest {
  private val keys = KeyPairGenerator.getInstance("Ed25519").generateKeyPair()

  /** The raw 32-byte public key, as the controller logs it. */
  private val publicKey = Base64.getEncoder().encodeToString(keys.public.encoded.takeLast(32).toByteArray())
  private val keyring = Keyring.parse("local-dev-1=$publicKey")

  private fun envelope(kind: String, version: String, keyId: String = "local-dev-1"): SignatureEnvelope {
    val signature = Signature.getInstance("Ed25519").apply {
      initSign(keys.private)
      update(Keyring.message(kind, version))
    }.sign()
    return SignatureEnvelope(Keyring.FORMAT, Keyring.ALGORITHM, keyId, kind, version, Base64.getEncoder().encodeToString(signature))
  }

  @Test
  fun `signed plans load from storage`(@TempDir dir: Path) {
    val data = timerToLogPlanJson().toByteArray()
    val version = Keyring.digest(data)
    val key = "orgs/org1/spaces/space1/channels/$CHANNEL_ID/plan/${version.removePrefix("sha256:")}.json"
    Files.createDirectories(dir.resolve(key).parent)
    Files.write(dir.resolve(key), data)
    Files.writeString(dir.resolve("$key.sig"), Json.encodeToString(SignatureEnvelope.serializer(), envelope("plan", version)))

    val plan = PlanLoader(DirectoryArtifactStore(dir), keyring).load(key, version)
    assertEquals(CHANNEL_ID, plan.metadata.channelId)
    assertEquals("*/1 * * * * *", plan.bindings.timer.single().cronExpression)
    assertEquals(emptyList<Any>(), plan.bindings.http)

    assertThrows<VerificationException> { PlanLoader(DirectoryArtifactStore(dir), keyring).load(key, "sha256:other") }
    assertThrows<VerificationException> { PlanLoader(DirectoryArtifactStore(dir), keyring).load("missing.json", version) }
  }

  @Test
  fun `verification rejects tampered, mismatched and untrusted signatures`() {
    val data = "artifact".toByteArray()
    val version = Keyring.digest(data)
    keyring.verify("plan", version, data, envelope("plan", version))

    assertThrows<VerificationException> { keyring.verify("plan", version, "other".toByteArray(), envelope("plan", version)) }
    assertThrows<VerificationException> { keyring.verify("plan", version, data, envelope("routing", version)) }
    assertThrows<VerificationException> { keyring.verify("plan", version, data, envelope("plan", version, keyId = "unknown")) }
    val forged = envelope("plan", version).copy(signature = Base64.getEncoder().encodeToString(ByteArray(64)))
    assertThrows<VerificationException> { keyring.verify("plan", version, data, forged) }
  }

  @Test
  fun `requests are signed with AWS Signature Version 4`() {
    // The GET Object example from the AWS documentation ("Signature Calculations for the Authorization
    // Header: Transferring Payload in a Single Chunk").
    val store = S3ArtifactStore(
      endpoint = URI("https://examplebucket.s3.amazonaws.com"),
      bucket = "examplebucket",
      region = "us-east-1",
      accessKeyId = "AKIAIOSFODNN7EXAMPLE",
      secretAccessKey = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      clock = Clock.fixed(Instant.parse("2013-05-24T00:00:00Z"), ZoneOffset.UTC),
    )
    val headers = store.signedHeaders("GET", "/test.txt", "", mapOf("Range" to "bytes=0-9"))
    assertEquals(
      "AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, " +
        "SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, " +
        "Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41",
      headers["authorization"],
    )
  }
}
