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

/** Parent of <NodeConfig />: owns the node's configuration in the editor store and all named option data. */
const PluginNodeOptions: FC<{ node: ChannelNode; identity: PluginIdentity; spaceId: string }> = ({
  node,
  identity,
  spaceId,
}) => {
  const setNodeConfig = useChannelEditorStore((state) => state.setNodeConfig)
  const config = useMemo(() => nodeConfig(node), [node])
  const { namedOptions, onOptionsSearch, onOptionsLoadMore } = useNamedOptions(spaceId, config)
  const handleChange = useCallback(
    (value: Record<string, unknown>) => setNodeConfig(node.id, value),
    [node.id, setNodeConfig],
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

const NodeOptionsPane: FC<Props> = ({ spaceId }) => {
  const currentNode = useChannelEditorStore((state) => state.currentNode)
  const validationErrors = useChannelEditorStore((state) => state.validationErrors)
  const identity = currentNode ? pluginIdentity(currentNode) : undefined
  const nodeErrors = currentNode ? validationErrors?.nodeErrors?.[currentNode.id] : undefined

  return (
    <div className="px-8 py-4 text-sm">
      <h2 className="uppercase text-gray-500 font-bold text-xs mb-2">Node Options</h2>
      {currentNode && identity && (
        <NodeDefinitionsProvider source={nodeDefinitions}>
          {/* Keyed by node so option state never leaks between nodes that share field paths */}
          <PluginNodeOptions
            key={currentNode.id}
            node={currentNode}
            identity={identity}
            spaceId={spaceId}
          />
        </NodeDefinitionsProvider>
      )}
      {currentNode && !identity && (
        <Alert variant="destructive" data-testid="node-config-unsupported">
          <CircleXIcon />
          <AlertTitle>Unsupported node definition: {currentNode.metadata.name}</AlertTitle>
          <AlertDescription>
            <p>
              This node has no plugin type and version, so it does not match any definition in the
              node library.
            </p>
            <p>The saved configuration is kept unchanged.</p>
          </AlertDescription>
        </Alert>
      )}
      {nodeErrors && nodeErrors.length > 0 && (
        <div className="mt-4">
          <h2 className="uppercase text-gray-500 font-bold text-xs mb-2">Node Errors</h2>
          <ul className="list-disc list-inside">
            {nodeErrors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export default NodeOptionsPane
