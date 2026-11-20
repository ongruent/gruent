package com.gruent.runtime.telemetry

import com.gruent.runtime.plan.Metadata
import io.opentelemetry.api.OpenTelemetry
import io.opentelemetry.api.common.Attributes
import io.opentelemetry.exporter.otlp.logs.OtlpGrpcLogRecordExporter
import io.opentelemetry.exporter.otlp.trace.OtlpGrpcSpanExporter
import io.opentelemetry.sdk.OpenTelemetrySdk
import io.opentelemetry.sdk.logs.SdkLoggerProvider
import io.opentelemetry.sdk.logs.export.BatchLogRecordProcessor
import io.opentelemetry.sdk.resources.Resource
import io.opentelemetry.sdk.trace.SdkTracerProvider
import io.opentelemetry.sdk.trace.export.BatchSpanProcessor
import java.util.concurrent.TimeUnit

/** OTel SDK of a runtime worker. Exports traces and logs over OTLP/gRPC to the platform's collector. */
class RuntimeOpenTelemetry private constructor(
  val openTelemetry: OpenTelemetry,
  private val sdk: OpenTelemetrySdk?,
) {
  /** Flushes buffered telemetry and stops the exporters. */
  fun shutdown() {
    sdk?.shutdown()?.join(10, TimeUnit.SECONDS)
  }

  companion object {
    const val SERVICE_NAME = "runtime"

    /** Telemetry that is dropped, for when no collector is configured. */
    fun noop(): RuntimeOpenTelemetry = RuntimeOpenTelemetry(OpenTelemetry.noop(), null)

    /**
     * Exports to [endpoint] (e.g. http://otel-collector:4317). Every span and log carries the channel's
     * identity as resource attributes, which is how the API finds channel executions among the
     * platform's other telemetry.
     */
    fun otlp(endpoint: String, metadata: Metadata, environment: String): RuntimeOpenTelemetry {
      val resource = Resource.getDefault().merge(
        Resource.create(
          Attributes.builder()
            .put("service.name", SERVICE_NAME)
            .put("service.instance.id", metadata.channelId)
            .put("deployment.environment", environment)
            .put(TelemetryAttributes.WORKLOAD, TelemetryAttributes.WORKLOAD_CHANNEL)
            .put(TelemetryAttributes.ORG_ID, metadata.orgId)
            .put(TelemetryAttributes.SPACE_ID, metadata.spaceId)
            .put(TelemetryAttributes.CHANNEL_ID, metadata.channelId)
            .build(),
        ),
      )
      val tracerProvider = SdkTracerProvider.builder()
        .setResource(resource)
        .addSpanProcessor(BatchSpanProcessor.builder(OtlpGrpcSpanExporter.builder().setEndpoint(endpoint).build()).build())
        .build()
      val loggerProvider = SdkLoggerProvider.builder()
        .setResource(resource)
        .addLogRecordProcessor(BatchLogRecordProcessor.builder(OtlpGrpcLogRecordExporter.builder().setEndpoint(endpoint).build()).build())
        .build()
      val sdk = OpenTelemetrySdk.builder()
        .setTracerProvider(tracerProvider)
        .setLoggerProvider(loggerProvider)
        .build()
      return RuntimeOpenTelemetry(sdk, sdk)
    }
  }
}
