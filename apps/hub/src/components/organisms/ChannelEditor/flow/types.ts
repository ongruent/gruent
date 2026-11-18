import type { ChannelEdge, ChannelNote } from '@gruent/libs/legacy/engine/channels/channels'
import type { ChannelNode } from '@gruent/libs/legacy/engine/nodes/v1'
import type { Edge, Node } from '@xyflow/react'

export type ChannelNodeType = ChannelNode['metadata']['type']

export type ChannelFlowNodeData = {
  node: ChannelNode
  errors: string[]
  // Colors of the IO handles that are active (attached to the selection), keyed by `ioKey`
  activeIo: Record<string, string>
}

export type ChannelFlowNoteData = {
  note: ChannelNote
}

export type ChannelFlowNode = Node<ChannelFlowNodeData, 'channelNode'>
export type ChannelFlowNote = Node<ChannelFlowNoteData, 'channelNote'>
export type ChannelFlowElement = ChannelFlowNode | ChannelFlowNote

export type ChannelFlowEdgeData = {
  edge: ChannelEdge
}

export type ChannelFlowEdge = Edge<ChannelFlowEdgeData>
