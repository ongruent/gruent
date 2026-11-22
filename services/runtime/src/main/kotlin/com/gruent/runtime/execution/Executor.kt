package com.gruent.runtime.execution

import com.gruent.runtime.telemetry.ExecutionInfo
import com.gruent.runtime.telemetry.ExecutionStatus
import com.gruent.runtime.telemetry.ExecutionTelemetry
import com.gruent.steps.api.ExecutionContext
import com.gruent.steps.api.ExecutionLogger
import com.gruent.steps.api.Response
import com.gruent.steps.api.StepMessage
import com.gruent.steps.api.Trigger
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeout
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicReference

/** A request to execute the channel once. */
data class ExecutionRequest(
  val invocationId: String,
  val sourceStepId: String,
  val trigger: Trigger,
)

data class ExecutionResult(
  val executionId: String,
  val status: ExecutionStatus,
  val error: Throwable? = null,
  /** The response a step gave to the request that started the execution (see [ExecutionContext.respond]). */
  val response: Response? = null,
)

/**
 * Executes a [ChannelGraph] once per request, with structured concurrency:
 *
 * - Every step runs as its own coroutine for the duration of the execution, reading its input channel and
 *   writing its output channel (see [com.gruent.steps.api.Step]).
 * - Each step's output is fanned out to the input channel of every downstream step. A message sent through
 *   an output port (e.g. a conditional step's success or failure branch) only travels along the edges from
 *   that port. A step's input
 *   closes once all of its upstream steps have finished, so completion flows through the DAG like the
 *   data does, and the execution is complete when every step coroutine has returned. This replaces the
 *   legacy engine's per-message "data processed" notifications.
 * - The source step named by the request turns the trigger into the first message. Other sources of the
 *   graph receive nothing and finish immediately.
 * - A step that throws fails the execution and cancels its other steps. [timeoutMs] bounds the execution
 *   (policies.runtime.timeouts.maxInvocationMs; 0 means no limit).
 *
 * Channels are bounded ([bufferCapacity]), so a slow step applies backpressure to the steps before it.
 */
class Executor(
  private val graph: ChannelGraph,
  private val channelId: String,
  private val planVersion: String,
  private val telemetry: ExecutionTelemetry,
  private val timeoutMs: Long = 0,
  private val bufferCapacity: Int = DEFAULT_BUFFER_CAPACITY,
) {
  suspend fun execute(request: ExecutionRequest): ExecutionResult {
    val recorder = telemetry.startExecution(
      ExecutionInfo(
        channelId = channelId,
        planVersion = planVersion,
        invocationId = request.invocationId,
        trigger = request.trigger.type,
        bindingId = request.trigger.bindingId,
        receivedAt = request.trigger.receivedAt,
      ),
    )
    val response = AtomicReference<Response?>()
    val result = try {
      if (timeoutMs > 0) {
        withTimeout(timeoutMs) { run(request, recorder, response) }
      } else {
        run(request, recorder, response)
      }
      ExecutionResult(recorder.executionId, ExecutionStatus.COMPLETED, response = response.get())
    } catch (e: TimeoutCancellationException) {
      ExecutionResult(recorder.executionId, ExecutionStatus.TIMEOUT, ExecutionTimeoutException(timeoutMs))
    } catch (e: CancellationException) {
      recorder.end(ExecutionStatus.CANCELLED, e)
      throw e
    } catch (e: Exception) {
      ExecutionResult(recorder.executionId, ExecutionStatus.FAILED, e)
    }
    recorder.end(result.status, result.error)
    return result
  }

  private suspend fun run(
    request: ExecutionRequest,
    recorder: com.gruent.runtime.telemetry.ExecutionRecorder,
    response: AtomicReference<Response?>,
  ) = coroutineScope {
    val source = graph.nodes[request.sourceStepId]
      ?: throw IllegalArgumentException("step ${request.sourceStepId} is not part of the plan")
    val sourceStep = graph.source(request.sourceStepId)
      ?: throw IllegalArgumentException("step ${request.sourceStepId} is not a source step")

    val inputs = graph.nodes.mapValues { Channel<StepMessage>(bufferCapacity) }
    val pendingUpstreams = graph.nodes.mapValues { AtomicInteger(it.value.upstreamCount) }

    val responseSlot = response
    fun context(node: GraphNode, logger: ExecutionLogger) = object : ExecutionContext {
      override val executionId: String = recorder.executionId
      override val channelId: String = this@Executor.channelId
      override val planVersion: String = this@Executor.planVersion
      override val trigger: Trigger = request.trigger
      override val logger: ExecutionLogger = logger

      // Only HTTP triggers have a request to answer; the worker replies to sync invocations.
      override fun respond(response: Response): Boolean =
        request.trigger.type == Trigger.TYPE_HTTP && responseSlot.compareAndSet(null, response)
    }

    // The source's first message is placed on its input before any step starts, so that the source
    // step's coroutine forwards it and then finishes.
    val sourceRecorder = recorder.startStep(source.id, source.planStep.name, source.planStep.type)
    val first = try {
      sourceStep.receive(request.trigger, context(source, sourceRecorder.logger))
    } catch (e: Exception) {
      sourceRecorder.end(e)
      throw e
    }
    inputs.getValue(source.id).send(first)

    for (node in graph.nodes.values) {
      val input = inputs.getValue(node.id)
      if (node.upstreamCount == 0) input.close()

      launch {
        val stepRecorder = if (node.id == source.id) sourceRecorder else recorder.startStep(node.id, node.planStep.name, node.planStep.type)
        val output = Channel<StepMessage>(bufferCapacity)
        val forwarder = launch {
          for (message in output) {
            for (edge in node.downstream) {
              if (edge.carries(message.port)) inputs.getValue(edge.to).send(message.withoutPort())
            }
          }
        }
        try {
          node.step.execute(input, output, context(node, stepRecorder.logger))
          // A step may finish without reading all of its input. Drain it so upstream steps never block.
          for (ignored in input) Unit
          stepRecorder.end()
        } catch (e: Throwable) {
          stepRecorder.end(e.takeUnless { it is CancellationException })
          throw if (e is CancellationException) e else StepFailedException(node.id, e)
        } finally {
          output.close()
        }
        forwarder.join()
        for (edge in node.downstream) {
          if (pendingUpstreams.getValue(edge.to).decrementAndGet() == 0) inputs.getValue(edge.to).close()
        }
      }
    }
  }

  companion object {
    const val DEFAULT_BUFFER_CAPACITY = 16
  }
}

class StepFailedException(val stepId: String, cause: Throwable) : Exception("step $stepId failed: ${cause.message}", cause)

class ExecutionTimeoutException(timeoutMs: Long) : Exception("the execution did not finish within ${timeoutMs}ms")
