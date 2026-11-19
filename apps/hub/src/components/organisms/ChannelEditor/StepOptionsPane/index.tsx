'use client'

import nodeDefinitions from '@gruent/hub/lib/nodeDefinitions'
import useChannelEditorStore from '@gruent/hub/stores/channelEditorStore'
import { Alert, AlertDescription, AlertTitle } from '@gruent/libs/frontend/components/core/alert'
import NodeConfig, { NodeDefinitionsProvider } from '@gruent/libs/frontend/components/NodeConfig'
import type { ChannelNode } from '@gruent/libs/legacy/engine/nodes/v1'
import { CircleXIcon } from 'lucide-react'
import { FC, useCallback, useMemo } from 'react'
import { nodeConfig, type PluginIdentity, pluginIdentity } from '../pluginNodes'
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
  const identity = currentStep ? pluginIdentity(currentStep) : undefined
  const stepErrors = currentStep ? validationErrors?.stepErrors?.[currentStep.id] : undefined

  return (
    <div className="px-8 py-4 text-sm">
      <h2 className="uppercase text-gray-500 font-bold text-xs mb-2">Step Options</h2>
      {currentStep && identity && (
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
      {currentStep && !identity && (
        <Alert variant="destructive" data-testid="step-config-unsupported">
          <CircleXIcon />
          <AlertTitle>Unsupported step definition: {currentStep.metadata.name}</AlertTitle>
          <AlertDescription>
            <p>
              This step has no plugin type and version, so it does not match any definition in the
              step library.
            </p>
            <p>The saved configuration is kept unchanged.</p>
          </AlertDescription>
        </Alert>
      )}
      {stepErrors && stepErrors.length > 0 && (
        <div className="mt-4">
          <h2 className="uppercase text-gray-500 font-bold text-xs mb-2">Step Errors</h2>
          <ul className="list-disc list-inside">
            {stepErrors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export default StepOptionsPane
