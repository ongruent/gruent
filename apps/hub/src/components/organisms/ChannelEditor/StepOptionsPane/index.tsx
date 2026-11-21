'use client'

import nodeDefinitions from '@gruent/hub/lib/nodeDefinitions'
import useChannelEditorStore from '@gruent/hub/stores/channelEditorStore'
import { Alert, AlertDescription, AlertTitle } from '@gruent/libs/frontend/components/core/alert'
import NodeConfig, { NodeDefinitionsProvider } from '@gruent/libs/frontend/components/NodeConfig'
import type { ChannelNode } from '@gruent/libs/legacy/engine/nodes/v1'
import { cn } from 'cn'
import { CircleAlertIcon, CircleXIcon } from 'lucide-react'
import { FC, useCallback, useMemo } from 'react'
import { nodeConfig, type PluginIdentity, pluginIdentity } from '../pluginNodes'
import { StepCategoryIcon } from '../flow/stepIcons'
import { stepCategoryStyle } from '../flow/stepStyles'
import InspectorSection from '../InspectorSection'
import useNamedOptions from './useNamedOptions'

type Props = {
  spaceId: string
}

/** Parent of <NodeConfig />: owns the step's configuration in the editor store and all named option data. */
const PluginStepOptions: FC<{ step: ChannelNode; identity: PluginIdentity; spaceId: string }> = ({
  step,
  identity,
  spaceId,
}) => {
  const setStepConfig = useChannelEditorStore((state) => state.setStepConfig)
  const config = useMemo(() => nodeConfig(step), [step])
  const { namedOptions, onOptionsSearch, onOptionsLoadMore } = useNamedOptions(spaceId, config)
  const handleChange = useCallback(
    (value: Record<string, unknown>) => setStepConfig(step.id, value),
    [step.id, setStepConfig],
  )

  return (
    <NodeConfig
      pluginType={identity.pluginType}
      pluginVersion={identity.pluginVersion}
      value={config}
      namedOptions={namedOptions}
      onChange={handleChange}
      onOptionsSearch={onOptionsSearch}
      onOptionsLoadMore={onOptionsLoadMore}
    />
  )
}

const StepOptionsPane: FC<Props> = ({ spaceId }) => {
  const currentStep = useChannelEditorStore((state) => state.currentStep)
  const validationErrors = useChannelEditorStore((state) => state.validationErrors)
  if (!currentStep) return null

  const identity = pluginIdentity(currentStep)
  const stepErrors = validationErrors?.stepErrors?.[currentStep.id]
  const { name, type, description } = currentStep.metadata
  const style = stepCategoryStyle(type)

  return (
    <InspectorSection
      data-testid="step-options"
      title={name}
      description={
        identity
          ? `${style.label} · ${identity.pluginType} v${identity.pluginVersion}`
          : style.label
      }
      media={
        <div
          className={cn('flex size-9 shrink-0 items-center justify-center rounded-md', style.chip)}
        >
          <StepCategoryIcon type={type} className="size-[18px]" />
        </div>
      }
    >
      <div className="flex flex-col gap-4 text-sm">
        {description && <p className="-mt-1 text-xs text-muted-foreground">{description}</p>}
        {stepErrors && stepErrors.length > 0 && (
          <Alert variant="destructive" data-testid="step-errors">
            <CircleAlertIcon />
            <AlertTitle>
              {stepErrors.length === 1 ? '1 issue' : `${stepErrors.length} issues`} with this step
            </AlertTitle>
            <AlertDescription>
              <ul className="list-inside list-disc">
                {stepErrors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}
        {identity && (
          <NodeDefinitionsProvider source={nodeDefinitions}>
            {/* Keyed by step so option state never leaks between steps that share field paths */}
            <PluginStepOptions
              key={currentStep.id}
              step={currentStep}
              identity={identity}
              spaceId={spaceId}
            />
          </NodeDefinitionsProvider>
        )}
        {!identity && (
          <Alert variant="destructive" data-testid="step-config-unsupported">
            <CircleXIcon />
            <AlertTitle>Unsupported step definition: {name}</AlertTitle>
            <AlertDescription>
              <p>
                This step has no plugin type and version, so it does not match any definition in the
                step library.
              </p>
              <p>The saved configuration is kept unchanged.</p>
            </AlertDescription>
          </Alert>
        )}
      </div>
    </InspectorSection>
  )
}

export default StepOptionsPane
