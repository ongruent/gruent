package com.gruent.runtime

import com.gruent.runtime.artifacts.PlanLoader
import com.gruent.runtime.invocations.InMemoryMessageBus
import com.gruent.runtime.invocations.MessageBus
import com.gruent.runtime.invocations.NatsMessageBus
import com.gruent.runtime.plan.Plan
import com.gruent.runtime.steps.StepRegistry
import com.gruent.runtime.telemetry.OtelExecutionTelemetry
import com.gruent.runtime.telemetry.RuntimeOpenTelemetry
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import org.slf4j.LoggerFactory
import java.util.concurrent.CountDownLatch
import kotlin.system.exitProcess

private val log = LoggerFactory.getLogger("com.gruent.runtime")

/**
 * Runtime worker entry point. A worker serves one plan version of one channel; the controller deploys it
 * with the plan's storage key and version (see [RuntimeConfig]).
 */
fun main() {
  val config = try {
    RuntimeConfig.fromEnvironment()
  } catch (e: IllegalArgumentException) {
    log.error("Invalid runtime configuration: {}", e.message)
    exitProcess(2)
  }
  val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
  val bus: MessageBus = config.natsUrl?.let { NatsMessageBus.connect(it, "runtime-${config.channelId}", scope) }
    ?: InMemoryMessageBus(scope).also { log.warn("${RuntimeConfig.NATS_URL} is not set; invocations only flow within this process") }
  val reporter = ObservationReporter(bus, config.channelId, config.planVersion)

  val plan = try {
    loadPlan(config)
  } catch (e: Exception) {
    log.error("Could not load plan {} ({}): {}", config.planVersion, config.planKey, e.message)
    reporter.report(Observation.FAILED, "could not load the plan: ${e.message}")
    bus.close()
    exitProcess(1)
  }

  val otel = config.otelEndpoint?.let { RuntimeOpenTelemetry.otlp(it, plan.metadata, config.environment) }
    ?: RuntimeOpenTelemetry.noop().also { log.warn("${RuntimeConfig.OTEL_ENDPOINT} is not set; execution telemetry is dropped") }

  val worker = try {
    val registry = StepRegistry.discover()
    log.info("Steps available: {}", registry.identities.sortedBy { it.first }.joinToString { "${it.first}@${it.second}" })
    ChannelWorker(plan, config.planVersion, registry, bus, OtelExecutionTelemetry(otel.openTelemetry))
  } catch (e: Exception) {
    log.error("Could not apply plan {}: {}", config.planVersion, e.message, e)
    reporter.report(Observation.FAILED, "could not apply the plan: ${e.message}")
    otel.shutdown()
    bus.close()
    exitProcess(1)
  }

  worker.start(scope)
  reporter.report(Observation.APPLIED)

  // Kubernetes sends SIGTERM when the channel is unpublished or replaced by a new version. Stop admitting
  // work, drain in-flight executions, and report that this version stopped.
  val stopped = CountDownLatch(1)
  Runtime.getRuntime().addShutdownHook(
    Thread {
      log.info("Shutting down")
      runBlocking { worker.stop(config.shutdownGracePeriod) }
      reporter.report(Observation.STOPPED)
      scope.cancel()
      otel.shutdown()
      bus.close()
      stopped.countDown()
    },
  )
  stopped.await()
}

/** Loads and verifies the plan, retrying while storage is unreachable. */
private fun loadPlan(config: RuntimeConfig): Plan = runBlocking {
  val loader = PlanLoader(config.artifactStore, config.keyring)
  var attempt = 0
  while (true) {
    try {
      val plan = loader.load(config.planKey, config.planVersion)
      require(plan.metadata.channelId == config.channelId) {
        "plan is for channel ${plan.metadata.channelId}, not ${config.channelId}"
      }
      log.info("Loaded plan {} of channel {}", config.planVersion, config.channelId)
      return@runBlocking plan
    } catch (e: java.io.IOException) {
      attempt++
      if (attempt >= 10) throw e
      log.warn("Could not reach artifact storage (attempt {}): {}", attempt, e.message)
      delay(1000L * attempt)
    }
  }
  @Suppress("UNREACHABLE_CODE")
  error("unreachable")
}
