package com.gruent.steps.plugins.timersource.v1

import com.gruent.steps.api.ExecutionContext
import com.gruent.steps.api.LogLevel
import com.gruent.steps.api.SourceStep
import com.gruent.steps.api.Step
import com.gruent.steps.api.StepCategory
import com.gruent.steps.api.StepConfigurationException
import com.gruent.steps.api.StepFactory
import com.gruent.steps.api.StepMessage
import com.gruent.steps.api.StepSpec
import com.gruent.steps.api.Trigger
import com.gruent.steps.config.ConfigValidationException

/** Creates `timer-source@1` steps. */
class TimerSourceStepFactory : StepFactory {
  override val pluginType: String = TimerSourceConfig.pluginType
  override val pluginVersion: Int = TimerSourceConfig.pluginVersion
  override val definitionDigest: String = TimerSourceConfig.definitionDigest
  override val category: StepCategory = StepCategory.SOURCE

  override fun create(spec: StepSpec): Step {
    val config = try {
      TimerSourceConfig.decode(spec.configJson)
    } catch (e: ConfigValidationException) {
      throw StepConfigurationException("invalid configuration for step ${spec.stepId}: ${e.message}", e)
    }
    return TimerSourceStep(config)
  }
}

/**
 * Starts an execution with a signal on every tick (ported from the legacy timer node).
 *
 * The legacy node owned its cron scheduler. Here the schedule is the plan's timer binding, which the
 * controller compiles from [TimerSourceConfig.cronExpression] and which a source (today the runtime's
 * timer trigger) turns into invocations. The step itself only records the tick and emits the signal.
 */
class TimerSourceStep(val config: TimerSourceConfig) : SourceStep() {
  override fun receive(trigger: Trigger, context: ExecutionContext): StepMessage {
    context.logger.log(
      LogLevel.INFO,
      "Timer triggered",
      mapOf("cronExpression" to config.cronExpression, "firedAt" to trigger.receivedAt.toString()),
    )
    return StepMessage.signal()
  }
}
