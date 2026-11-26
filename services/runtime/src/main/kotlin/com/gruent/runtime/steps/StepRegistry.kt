package com.gruent.runtime.steps

import com.gruent.steps.api.Redaction
import com.gruent.steps.api.Step
import com.gruent.steps.api.StepCategory
import com.gruent.steps.api.StepFactory
import com.gruent.steps.api.StepSpec
import kotlinx.serialization.json.JsonNull
import java.util.ServiceLoader
import com.gruent.runtime.plan.Step as PlanStep

/** Thrown when a plan step has no implementation in this runtime, or a different one than it pins. */
class UnsupportedStepException(message: String) : Exception(message)

/**
 * The step implementations available to the runtime, by exact step library identity. Like the controller,
 * the editor and the validators, the runtime never resolves "latest": a plan step must name a
 * `pluginType` + `pluginVersion` that is registered here, with the same definition digest.
 */
class StepRegistry(factories: Iterable<StepFactory>) {
  private val factories: Map<Pair<String, Int>, StepFactory> = buildMap {
    for (factory in factories) {
      val identity = factory.pluginType to factory.pluginVersion
      val existing = put(identity, factory)
      require(existing == null || existing.definitionDigest == factory.definitionDigest) {
        "step ${factory.pluginType}@${factory.pluginVersion} is registered twice with different definitions"
      }
    }
  }

  val identities: Set<Pair<String, Int>> get() = factories.keys

  fun factory(step: PlanStep): StepFactory {
    val definition = step.definition
      ?: throw UnsupportedStepException("step ${step.id} (${step.type}) was not created from the step library; only step library steps can run")
    val factory = factories[definition.pluginType to definition.pluginVersion]
      ?: throw UnsupportedStepException("step ${step.id} uses ${definition.pluginType}@${definition.pluginVersion}, which this runtime does not implement")
    if (factory.definitionDigest != definition.digest) {
      throw UnsupportedStepException(
        "step ${step.id} pins ${definition.pluginType}@${definition.pluginVersion} with digest ${definition.digest}, " +
          "but this runtime implements digest ${factory.definitionDigest}",
      )
    }
    if (factory.category.value != step.category) {
      throw UnsupportedStepException("step ${step.id} has category ${step.category}, but ${definition.pluginType}@${definition.pluginVersion} is a ${factory.category.value} step")
    }
    return factory
  }

  /**
   * Creates the implementation of a plan step. [connections] are the plan's hydrated connections by ID
   * (see [com.gruent.runtime.dependencies.ConnectionHydrator]); the step gets the ones it references.
   */
  fun create(step: PlanStep, connections: Map<String, String> = emptyMap()): Step {
    val factory = factory(step)
    val definition = step.definition!!
    return factory.create(
      StepSpec(
        stepId = step.id,
        name = step.name,
        pluginType = definition.pluginType,
        pluginVersion = definition.pluginVersion,
        configJson = step.config?.toString() ?: "{}",
        redaction = step.redaction?.let { Redaction(it.paths, it.replacement) },
        compiledJson = step.compiled?.takeUnless { it is JsonNull }?.toString(),
        connections = step.connectionRefs.mapNotNull { id -> connections[id]?.let { id to it } }.toMap(),
      ),
    )
  }

  fun isSource(step: PlanStep): Boolean = factory(step).category == StepCategory.SOURCE

  companion object {
    /** Discovers the steps on the classpath (META-INF/services/com.gruent.steps.api.StepFactory). */
    fun discover(classLoader: ClassLoader = StepRegistry::class.java.classLoader): StepRegistry =
      StepRegistry(ServiceLoader.load(StepFactory::class.java, classLoader).toList())
  }
}
