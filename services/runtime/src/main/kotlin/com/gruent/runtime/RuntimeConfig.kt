package com.gruent.runtime

import com.gruent.runtime.artifacts.ArtifactStore
import com.gruent.runtime.artifacts.DirectoryArtifactStore
import com.gruent.runtime.artifacts.Keyring
import com.gruent.runtime.artifacts.S3ArtifactStore
import java.net.URI
import java.nio.file.Path
import java.time.Duration

/**
 * Configuration of a runtime worker, from environment variables. The controller sets them on the worker's
 * Deployment (see libs/engine/workers in Go, which defines the same names).
 */
data class RuntimeConfig(
  val channelId: String,
  val planKey: String,
  val planVersion: String,
  val artifactStore: ArtifactStore,
  val keyring: Keyring,
  /** NATS server URL. Without one, invocations only flow within the process (local runs). */
  val natsUrl: String?,
  /** OTLP/gRPC endpoint of the collector. Without one, execution telemetry is dropped. */
  val otelEndpoint: String?,
  val environment: String,
  val shutdownGracePeriod: Duration,
) {
  companion object {
    const val CHANNEL_ID = "GRUENT_CHANNEL_ID"
    const val PLAN_KEY = "GRUENT_PLAN_KEY"
    const val PLAN_VERSION = "GRUENT_PLAN_VERSION"
    const val SIGNING_KEYRING = "ARTIFACT_SIGNING_KEYRING"
    const val STORAGE_DIR = "ARTIFACT_STORAGE_DIR"
    const val STORAGE_ENDPOINT = "ARTIFACT_STORAGE_ENDPOINT"
    const val STORAGE_BUCKET = "ARTIFACT_STORAGE_BUCKET"
    const val STORAGE_REGION = "ARTIFACT_STORAGE_REGION"
    const val STORAGE_ACCESS_KEY_ID = "ARTIFACT_STORAGE_ACCESS_KEY_ID"
    const val STORAGE_SECRET_ACCESS_KEY = "ARTIFACT_STORAGE_SECRET_ACCESS_KEY"
    const val STORAGE_USE_SSL = "ARTIFACT_STORAGE_USE_SSL"
    const val NATS_URL = "NATS_URL"
    const val OTEL_ENDPOINT = "OTEL_COLLECTOR_ENDPOINT"
    const val ENVIRONMENT = "ENVIRONMENT"
    const val SHUTDOWN_GRACE_SECONDS = "GRUENT_SHUTDOWN_GRACE_SECONDS"

    fun fromEnvironment(env: Map<String, String> = System.getenv()): RuntimeConfig {
      fun required(name: String) = env[name]?.takeIf { it.isNotBlank() } ?: throw IllegalArgumentException("$name is required")
      fun optional(name: String) = env[name]?.takeIf { it.isNotBlank() }

      val store = optional(STORAGE_DIR)?.let { DirectoryArtifactStore(Path.of(it)) } ?: run {
        val endpoint = required(STORAGE_ENDPOINT)
        val scheme = if (optional(STORAGE_USE_SSL)?.toBoolean() == true) "https" else "http"
        S3ArtifactStore(
          endpoint = URI(if (endpoint.contains("://")) endpoint else "$scheme://$endpoint"),
          bucket = required(STORAGE_BUCKET),
          region = optional(STORAGE_REGION) ?: "us-east-1",
          accessKeyId = required(STORAGE_ACCESS_KEY_ID),
          secretAccessKey = required(STORAGE_SECRET_ACCESS_KEY),
        )
      }
      return RuntimeConfig(
        channelId = required(CHANNEL_ID),
        planKey = required(PLAN_KEY),
        planVersion = required(PLAN_VERSION),
        artifactStore = store,
        keyring = Keyring.parse(required(SIGNING_KEYRING)),
        natsUrl = optional(NATS_URL),
        otelEndpoint = optional(OTEL_ENDPOINT)?.let { if (it.contains("://")) it else "http://$it" },
        environment = optional(ENVIRONMENT) ?: "development",
        shutdownGracePeriod = Duration.ofSeconds(optional(SHUTDOWN_GRACE_SECONDS)?.toLong() ?: 30),
      )
    }
  }
}
