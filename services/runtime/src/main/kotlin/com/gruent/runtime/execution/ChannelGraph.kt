package com.gruent.runtime.execution

import com.gruent.runtime.plan.Plan
import com.gruent.runtime.steps.StepRegistry
import com.gruent.steps.api.SourceStep
import com.gruent.steps.api.Step
import com.gruent.runtime.plan.Step as PlanStep

/** Thrown when a plan's graph can't be executed. */
class InvalidGraphException(message: String) : Exception(message)

/** An edge out of a step: the output port it leaves from (empty for the default output) and its target. */
data class Downstream(val fromPort: String, val to: String) {
  /** Whether a message sent through [port] (null: no port) travels along this edge. */
  fun carries(port: String?): Boolean = port == null || port == fromPort
}

/** A step of an applied plan: its plan entry, its implementation and its edges. */
class GraphNode(
  val planStep: PlanStep,
  val step: Step,
  /** The edges that receive this step's output, one entry per edge. */
  val downstream: List<Downstream>,
  /** Number of edges into this step. Its input closes once every upstream step has finished. */
  val upstreamCount: Int,
) {
  val id: String get() = planStep.id
}

/**
 * The executable form of a plan's DAG: one step instance per plan step, created once when the plan is
 * applied and shared by every execution.
 */
class ChannelGraph private constructor(val nodes: Map<String, GraphNode>) {
  /** The source step that starts executions for [stepId]. */
  fun source(stepId: String): SourceStep? = nodes[stepId]?.step as? SourceStep

  /** Releases every step's resources. */
  suspend fun close() {
    for (node in nodes.values) {
      runCatching { node.step.close() }
    }
  }

  companion object {
    /**
     * Validates the graph (edges reference existing steps, sources have no inputs, no cycles) and creates
     * the step implementations with the plan's hydrated [connections].
     */
    fun build(plan: Plan, registry: StepRegistry, connections: Map<String, String> = emptyMap()): ChannelGraph {
      val steps = plan.channel.graph.steps
      val ids = steps.map { it.id }
      ids.groupingBy { it }.eachCount().filterValues { it > 1 }.keys.firstOrNull()?.let {
        throw InvalidGraphException("step $it appears more than once")
      }
      val known = ids.toSet()
      val downstream = mutableMapOf<String, MutableList<Downstream>>()
      val upstreamCount = mutableMapOf<String, Int>()
      for (edge in plan.channel.graph.edges) {
        if (edge.from !in known || edge.to !in known) {
          throw InvalidGraphException("edge ${edge.from} -> ${edge.to} references a step that is not in the plan")
        }
        downstream.getOrPut(edge.from) { mutableListOf() }.add(Downstream(edge.fromPort, edge.to))
        upstreamCount[edge.to] = (upstreamCount[edge.to] ?: 0) + 1
      }
      checkAcyclic(ids, downstream.mapValues { (_, edges) -> edges.map { it.to } })

      val nodes = linkedMapOf<String, GraphNode>()
      for (planStep in steps) {
        val step = registry.create(planStep, connections)
        if (step is SourceStep && (upstreamCount[planStep.id] ?: 0) > 0) {
          throw InvalidGraphException("source step ${planStep.id} cannot have inputs")
        }
        nodes[planStep.id] = GraphNode(planStep, step, downstream[planStep.id].orEmpty(), upstreamCount[planStep.id] ?: 0)
      }
      return ChannelGraph(nodes)
    }

    private fun checkAcyclic(ids: List<String>, downstream: Map<String, List<String>>) {
      val inDegree = ids.associateWith { 0 }.toMutableMap()
      downstream.values.flatten().forEach { inDegree[it] = inDegree.getValue(it) + 1 }
      val ready = ArrayDeque(inDegree.filterValues { it == 0 }.keys)
      var visited = 0
      while (ready.isNotEmpty()) {
        val id = ready.removeFirst()
        visited++
        for (next in downstream[id].orEmpty()) {
          inDegree[next] = inDegree.getValue(next) - 1
          if (inDegree.getValue(next) == 0) ready.addLast(next)
        }
      }
      if (visited != ids.size) {
        throw InvalidGraphException("the channel graph has a cycle")
      }
    }
  }
}
