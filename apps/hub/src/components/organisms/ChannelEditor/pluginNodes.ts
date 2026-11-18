import type { Category, Definition } from '@gruent/libs/engine/nodes/ts'
import type { ChannelNode, ChannelNodeIO } from '@gruent/libs/legacy/engine/nodes/v1'

/** Exact plugin identity persisted with every node created from the node library. */
export type PluginIdentity = { pluginType: string; pluginVersion: number }

/**
 * The persisted plugin identity of a node, or undefined for legacy nodes that predate the node library. Legacy
 * nodes are kept as they are; they are never matched to a definition by name.
 */
export const pluginIdentity = (node: ChannelNode): PluginIdentity | undefined => {
  const { pluginType, pluginVersion } = node.metadata as Partial<PluginIdentity>
  if (typeof pluginType !== 'string' || typeof pluginVersion !== 'number') return undefined
  return { pluginType, pluginVersion }
}

export const nodeConfig = (node: ChannelNode): Record<string, unknown> =>
  (node.metadata.config ?? {}) as Record<string, unknown>

const DOWNSTREAM: ChannelNodeIO['allowedEdge'] = ['processing', 'action', 'conditional', 'custom']

/**
 * Node definitions declare no ports (contract v1), so the canvas gives every node the same generic handles:
 * sources have one output, all other categories one input and one output.
 */
const genericIo = (category: Category): ChannelNode['metadata']['io'] => {
  const output: ChannelNodeIO = { id: 'output', allowedEdge: DOWNSTREAM, dataType: ['bytes'] }
  const input: ChannelNodeIO = { id: 'input', allowedEdge: ['*'], dataType: ['bytes'] }
  return { inputs: category === 'source' ? [] : [input], outputs: [output] }
}

/**
 * A new channel node for an exact definition. Declared defaults are applied here, at explicit creation time,
 * and nowhere else.
 */
export const createPluginNode = (definition: Definition): ChannelNode => {
  const { pluginType, pluginVersion, displayName, description, category } = definition.document
  const metadata = {
    pluginType,
    pluginVersion,
    version: String(pluginVersion),
    name: displayName,
    label: pluginType,
    type: category,
    description,
    io: genericIo(category),
    config: definition.createConfig(),
    dependencies: { models: [], things: [] },
  }
  return { id: '', coordinates: { x: 0, y: 0 }, metadata } as unknown as ChannelNode
}
