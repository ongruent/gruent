package com.gruent.runtime

import com.gruent.runtime.plan.Plan
import com.gruent.runtime.steps.StepRegistry
import com.gruent.steps.api.Step
import com.gruent.steps.api.StepCategory
import com.gruent.steps.api.StepFactory
import com.gruent.steps.api.StepSpec
import com.gruent.runtime.telemetry.ExecutionInfo
import com.gruent.runtime.telemetry.ExecutionRecorder
import com.gruent.runtime.telemetry.ExecutionStatus
import com.gruent.runtime.telemetry.ExecutionTelemetry
import com.gruent.runtime.telemetry.StepRecorder
import com.gruent.steps.api.ExecutionLogger
import com.gruent.steps.api.LogLevel
import com.gruent.steps.plugins.log.v1.LogConfig
import com.gruent.steps.plugins.timersource.v1.TimerSourceConfig
import java.util.Collections
import java.util.concurrent.atomic.AtomicInteger

const val CHANNEL_ID = "ch1"
const val PLAN_VERSION = "sha256:0000000000000000000000000000000000000000000000000000000000000001"

/**
 * A plan as the controller compiles it for a timer source connected to a log step. Mirrors the Go
 * encoding, including nulls for empty slices.
 */
fun timerToLogPlanJson(
    cron: String = "*/1 * * * * *",
    logConfig: String = """{"level":"info","message":"Tick"}""",
    maxConcurrent: Int = 1,
    maxQueued: Int = 0,
    maxInvocationMs: Long = 0,
    extraSteps: String = "",
    extraEdges: String = "",
    logDigest: String = LogConfig.definitionDigest,
    logRedaction: String = "",
): String = """
{
  "apiVersion": "gruent.com/v1",
  "kind": "Plan",
  "metadata": {"orgId": "org1", "spaceId": "space1", "channelId": "$CHANNEL_ID", "channelName": "Ticks"},
  "publishStrategy": {"mode": "replace"},
  "channel": {
    "name": "Ticks",
    "graph": {
      "steps": [
        {
          "id": "timer",
          "type": "source.timer-source",
          "version": "1",
          "name": "Timer",
          "definition": {"pluginType": "timer-source", "pluginVersion": 1, "digest": "${TimerSourceConfig.definitionDigest}"},
          "config": {"cronExpression": "$cron"},
          "bindingRef": "timer-timer",
          "modelRefs": null,
          "connectionRefs": null
        },
        {
          "id": "log",
          "type": "action.log",
          "version": "1",
          "name": "Log",
          "definition": {"pluginType": "log", "pluginVersion": 1, "digest": "$logDigest"},
          "config": $logConfig,
          "modelRefs": null,
          "connectionRefs": null
          $logRedaction
        }
        $extraSteps
      ],
      "edges": [
        {"from": "timer", "fromPort": "", "to": "log", "toPort": ""}
        $extraEdges
      ]
    }
  },
  "bindings": {
    "http": null,
    "timer": [
      {
        "bindingId": "timer-timer",
        "stepId": "timer",
        "cronExpression": "$cron",
        "subject": "gruent.v1.invocations.$CHANNEL_ID",
        "inputModelRefs": null,
        "overflow": {"action": "skip"}
      }
    ],
    "messageQueue": null
  },
  "payloads": {"encoding": "flatbuffers", "schema": {"kind": "payload_schema", "version": "sha256:1", "key": "k"}, "namespace": "n", "steps": []},
  "dependencies": {"kind": "dependency_bundle", "version": "sha256:2", "key": "k"},
  "policies": {
    "runtime": {
      "executionClass": "standard",
      "concurrency": {"maxConcurrentExecutions": $maxConcurrent, "maxQueuedExecutions": $maxQueued},
      "timeouts": {"maxInvocationMs": $maxInvocationMs}
    },
    "deployment": {"resources": {"allocationMode": "static", "memoryMiB": 256, "memoryReservationMiB": 256}}
  }
}
""".trimIndent()

fun timerToLogPlan(json: String = timerToLogPlanJson()): Plan = Plan.parse(json.toByteArray())

data class LogEntry(
    val executionId: String,
    val stepId: String,
    val level: LogLevel,
    val message: String,
    val attributes: Map<String, String>
)

/** Telemetry that records log entries and execution results in memory. */
class RecordingTelemetry : ExecutionTelemetry {
    val logs: MutableList<LogEntry> = Collections.synchronizedList(mutableListOf())
    val executions: MutableList<Pair<String, ExecutionStatus>> = Collections.synchronizedList(mutableListOf())
    val steps: MutableList<Pair<String, String>> = Collections.synchronizedList(mutableListOf())
    private val ids = AtomicInteger()

    override fun startExecution(info: ExecutionInfo): ExecutionRecorder {
        val executionId = "exec-${ids.incrementAndGet()}"
        return object : ExecutionRecorder {
            override val executionId: String = executionId

            override fun startStep(stepId: String, stepName: String, stepType: String): StepRecorder =
                object : StepRecorder {
                    override val logger = ExecutionLogger { level, message, attributes ->
                        logs += LogEntry(executionId, stepId, level, message, attributes)
                    }

                    override fun end(error: Throwable?) {
                        steps += executionId to stepId
                    }
                }

            override fun end(status: ExecutionStatus, error: Throwable?) {
                executions += executionId to status
            }
        }
    }
}

/** A processing step factory for tests, pinned by the digest "sha256:<type>". */
fun testFactory(type: String, create: () -> Step): StepFactory = object : StepFactory {
    override val pluginType = type
    override val pluginVersion = 1
    override val definitionDigest = "sha256:$type"
    override val category = StepCategory.PROCESSING

    override fun create(spec: StepSpec): Step = create()
}

/** The steps on the classpath (timer-source@1 and log@1) plus [extra] test steps. */
fun testRegistry(vararg extra: StepFactory): StepRegistry {
    val discovered = StepRegistry.discover()
    val plan = timerToLogPlan()
    return StepRegistry(plan.channel.graph.steps.map { discovered.factory(it) } + extra)
}

fun processingStepJson(id: String, type: String) =
    """,{"id":"$id","type":"processing.$type","name":"$id","definition":{"pluginType":"$type","pluginVersion":1,"digest":"sha256:$type"},"config":{}}"""

fun edgeJson(from: String, to: String, fromPort: String = "") = """,{"from":"$from","fromPort":"$fromPort","to":"$to"}"""
