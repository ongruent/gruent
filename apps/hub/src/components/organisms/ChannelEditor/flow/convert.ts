import type { ChannelEdge, ChannelNote } from '@gruent/libs/engine/channels/channels'
import type { ChannelNode } from '@gruent/libs/engine/nodes/v1'
import { type Connection, MarkerType } from '@xyflow/react'
import type {
  ChannelFlowEdge,
  ChannelFlowElement,
  ChannelFlowNode,
  ChannelFlowNote,
  ChannelNodeType,
} from './types'

export const GRID_SIZE = 24
export const NODE_SIZE = 90
export const NOTE_WIDTH = 192
export const NOTE_HEIGHT = 95

// Inputs/outputs that are handled implicitly by the rules engine and are never drawn
export const HIDDEN_INPUT_IDS = ['passThrough']
export const HIDDEN_OUTPUT_IDS = ['httpResponseOutput']

export const nodeTypeColor = (type: ChannelNodeType | undefined): string => {
  switch (type) {
    case 'source':
      return 'var(--color-green-500)'
    case 'processing':
      return 'var(--color-blue-500)'
    case 'action':
      return 'var(--color-red-500)'
    case 'conditional':
      return 'var(--color-orange-500)'
    case 'custom':
      return 'var(--color-violet-500)'
    default:
      return 'var(--color-gray-500)'
  }
}

export const ioKey = (io: 'input' | 'output', ioId: string) => `${io}:${ioId}`

export const snapToGrid = (value: number) => Math.round(value / GRID_SIZE) * GRID_SIZE

type ToFlowNodesParams = {
  nodes: Map<string, ChannelNode>
  notes: Map<string, ChannelNote>
  edges: Map<string, ChannelEdge>
  currentNode: ChannelNode | null
  currentEdge: ChannelEdge | null
  currentNote: ChannelNote | null
  nodeErrors: Record<string, string[]> | null | undefined
}

/**
 * Maps the editor store (the API-interpretable channel config) to xyflow nodes. Channel notes
 * are rendered as their own xyflow node type so they can be selected and dragged like nodes.
 */
export const toFlowNodes = ({
  nodes,
  notes,
  edges,
  currentNode,
  currentEdge,
  currentNote,
  nodeErrors,
}: ToFlowNodesParams): ChannelFlowElement[] => {
  // Active IO handles are drawn in the color of the node that feeds them, keyed by node ID
  const activeIo = new Map<string, Record<string, string>>()
  const markActive = (nodeId: string, handleKey: string, color: string) => {
    activeIo.set(nodeId, { ...(activeIo.get(nodeId) ?? {}), [handleKey]: color })
  }

  if (currentNode) {
    const color = nodeTypeColor(currentNode.metadata.type)
    for (const input of currentNode.metadata.io.inputs)
      markActive(currentNode.id, ioKey('input', input.id), color)
    for (const output of currentNode.metadata.io.outputs)
      markActive(currentNode.id, ioKey('output', output.id), color)
    for (const edge of edges.values()) {
      if (edge.from.nodeId === currentNode.id)
        markActive(edge.to.nodeId, ioKey('input', edge.to.ioId), color)
    }
  }

  if (currentEdge) {
    const color = nodeTypeColor(nodes.get(currentEdge.from.nodeId)?.metadata.type)
    markActive(currentEdge.from.nodeId, ioKey('output', currentEdge.from.ioId), color)
    markActive(currentEdge.to.nodeId, ioKey('input', currentEdge.to.ioId), color)
  }

  const flowNotes: ChannelFlowNote[] = Array.from(notes.values()).map((note) => ({
    id: note.id,
    type: 'channelNote',
    position: { x: note.coordinates.x, y: note.coordinates.y },
    width: NOTE_WIDTH,
    height: NOTE_HEIGHT,
    selected: currentNote?.id === note.id,
    data: { note },
  }))

  const flowNodes: ChannelFlowNode[] = Array.from(nodes.values()).map((node) => ({
    id: node.id,
    type: 'channelNode',
    position: { x: node.coordinates.x, y: node.coordinates.y },
    width: NODE_SIZE,
    height: NODE_SIZE,
    selected: currentNode?.id === node.id,
    data: {
      node,
      errors: nodeErrors?.[node.id] ?? [],
      activeIo: activeIo.get(node.id) ?? {},
    },
  }))

  // Notes render above nodes, matching the previous canvas draw order
  return [...flowNodes, ...flowNotes]
}

type ToFlowEdgesParams = {
  nodes: Map<string, ChannelNode>
  edges: Map<string, ChannelEdge>
  currentNode: ChannelNode | null
  currentEdge: ChannelEdge | null
}

/**
 * Maps channel edges to xyflow edges. A channel edge always flows from an output IO (xyflow
 * "source" handle) to an input IO (xyflow "target" handle), with the IO IDs used as handle IDs.
 */
export const toFlowEdges = ({
  nodes,
  edges,
  currentNode,
  currentEdge,
}: ToFlowEdgesParams): ChannelFlowEdge[] =>
  Array.from(edges.values())
    .filter((edge) => nodes.has(edge.from.nodeId) && nodes.has(edge.to.nodeId))
    .map((edge) => {
      const isActive = currentEdge?.id === edge.id || currentNode?.id === edge.from.nodeId
      const color = isActive
        ? nodeTypeColor(nodes.get(edge.from.nodeId)?.metadata.type)
        : 'var(--channel-editor-idle-color)'

      return {
        id: edge.id,
        source: edge.from.nodeId,
        sourceHandle: edge.from.ioId,
        target: edge.to.nodeId,
        targetHandle: edge.to.ioId,
        selected: currentEdge?.id === edge.id,
        animated: isActive,
        style: { stroke: color, strokeWidth: 1.5 },
        markerEnd: { type: MarkerType.ArrowClosed, color, width: 16, height: 16 },
        data: { edge },
      }
    })

export type ConnectionValidation =
  | { valid: true; edge: Omit<ChannelEdge, 'id'> }
  | { valid: false; reason: string }

/**
 * Validates a new xyflow connection against the channel's IO semantics and converts it into a
 * channel edge (minus its ID). xyflow only connects source (output) handles to target (input)
 * handles, so `connection.source` is always the output node.
 */
export const validateConnection = (
  connection: Connection,
  nodes: Map<string, ChannelNode>,
  edges: Map<string, ChannelEdge>,
): ConnectionValidation => {
  const { source, sourceHandle, target, targetHandle } = connection

  if (source === target) return { valid: false, reason: 'Cannot connect a node to itself.' }

  const outputNode = nodes.get(source)
  const inputNode = nodes.get(target)
  if (!outputNode || !inputNode || !sourceHandle || !targetHandle)
    return { valid: false, reason: 'These two nodes cannot be connected.' }

  const output = outputNode.metadata.io.outputs.find((io) => io.id === sourceHandle)
  const input = inputNode.metadata.io.inputs.find((io) => io.id === targetHandle)
  if (!output || !input)
    return {
      valid: false,
      reason: 'Connections must go from an output to an input.',
    }

  const isAllowedInput = inputNode.metadata.io.inputs.some(
    (io) => io.allowedEdge.includes(outputNode.metadata.type) || io.allowedEdge.includes('*'),
  )
  const isAllowedOutput = outputNode.metadata.io.outputs.some(
    (io) => io.allowedEdge.includes(inputNode.metadata.type) || io.allowedEdge.includes('*'),
  )
  if (!isAllowedInput || !isAllowedOutput)
    return { valid: false, reason: 'These two nodes cannot be connected.' }

  for (const edge of edges.values()) {
    if (
      edge.from.nodeId === source &&
      edge.from.ioId === sourceHandle &&
      edge.to.nodeId === target &&
      edge.to.ioId === targetHandle
    )
      return { valid: false, reason: 'These two nodes are already connected.' }
  }

  return {
    valid: true,
    edge: {
      from: { nodeId: source, ioId: sourceHandle },
      to: { nodeId: target, ioId: targetHandle },
    },
  }
}
