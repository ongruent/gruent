package com.gruent.runtime.artifacts

import com.gruent.runtime.plan.Plan
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.security.KeyFactory
import java.security.MessageDigest
import java.security.PublicKey
import java.security.Signature
import java.security.spec.X509EncodedKeySpec
import java.util.Base64

/** Thrown when an artifact fails verification. The runtime never applies an unverified artifact. */
class VerificationException(message: String) : Exception(message)

/** A detached artifact signature (`signing.Envelope` in libs/engine/signing). */
@Serializable
data class SignatureEnvelope(
  val format: String,
  val algorithm: String,
  val keyId: String,
  val artifactKind: String,
  val artifactVersion: String,
  val signature: String,
)

/**
 * The runtime's trusted artifact signing keys, by key ID. Implements the verification contract of
 * libs/engine/signing: digest, envelope format, artifact kind and version, trusted key, Ed25519 signature.
 */
class Keyring(private val keys: Map<String, PublicKey>) {
  fun verify(kind: String, expectedVersion: String, data: ByteArray, envelope: SignatureEnvelope) {
    val version = digest(data)
    if (version != expectedVersion) {
      throw VerificationException("artifact digest $version does not match the expected version $expectedVersion")
    }
    if (envelope.format != FORMAT || envelope.algorithm != ALGORITHM) {
      throw VerificationException("unsupported signature format ${envelope.format} with algorithm ${envelope.algorithm}")
    }
    if (envelope.artifactKind != kind || envelope.artifactVersion != expectedVersion) {
      throw VerificationException("signature is for a different artifact")
    }
    val key = keys[envelope.keyId] ?: throw VerificationException("signature key ${envelope.keyId} is not trusted")
    val signature = try {
      Base64.getDecoder().decode(envelope.signature)
    } catch (_: IllegalArgumentException) {
      throw VerificationException("signature is not valid base64")
    }
    val verifier = Signature.getInstance("Ed25519").apply {
      initVerify(key)
      update(message(kind, expectedVersion))
    }
    if (!verifier.verify(signature)) {
      throw VerificationException("invalid signature")
    }
  }

  companion object {
    const val FORMAT = "gruent.artifact-signature/v1"
    const val ALGORITHM = "ed25519"

    /** DER prefix of an X.509 SubjectPublicKeyInfo for a raw 32-byte Ed25519 key. */
    private val ED25519_SPKI_PREFIX = byteArrayOf(0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00)

    fun digest(data: ByteArray): String =
      "sha256:" + MessageDigest.getInstance("SHA-256").digest(data).joinToString("") { "%02x".format(it) }

    fun message(kind: String, version: String): ByteArray = "$FORMAT\n$kind\n$version\n".toByteArray()

    /** Parses base64 raw Ed25519 public keys (as logged by the controller) by key ID. */
    fun of(publicKeys: Map<String, String>): Keyring = Keyring(
      publicKeys.mapValues { (keyId, encoded) ->
        val raw = try {
          Base64.getDecoder().decode(encoded.trim())
        } catch (_: IllegalArgumentException) {
          null
        }
        require(raw != null && raw.size == 32) { "invalid Ed25519 public key $keyId" }
        KeyFactory.getInstance("Ed25519").generatePublic(X509EncodedKeySpec(ED25519_SPKI_PREFIX + raw))
      },
    )

    /** Parses "keyId=base64,keyId2=base64". */
    fun parse(spec: String): Keyring = of(
      spec.split(',').map { it.trim() }.filter { it.isNotEmpty() }.associate { entry ->
        val separator = entry.indexOf('=')
        require(separator > 0) { "invalid keyring entry; expected <key ID>=<base64 public key>" }
        entry.substring(0, separator) to entry.substring(separator + 1)
      },
    )
  }
}

/** Loads and verifies plans from artifact storage. */
class PlanLoader(private val store: ArtifactStore, private val keyring: Keyring) {
  /** Downloads the plan at [key] and its signature, and verifies them against [expectedVersion]. */
  fun load(key: String, expectedVersion: String): Plan {
    val data = store.get(key) ?: throw VerificationException("plan $key does not exist")
    val envelopeData = store.get("$key.sig") ?: throw VerificationException("plan $key has no signature")
    val envelope = envelopeJson.decodeFromString(SignatureEnvelope.serializer(), envelopeData.decodeToString())
    keyring.verify(ARTIFACT_PLAN, expectedVersion, data, envelope)
    return Plan.parse(data)
  }

  companion object {
    /** Artifact kind of plans in identities, storage keys and signatures. */
    const val ARTIFACT_PLAN = "plan"

    private val envelopeJson = Json { ignoreUnknownKeys = true }
  }
}
