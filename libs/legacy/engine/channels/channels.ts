import { ChannelNode } from "../nodes/v1/node"

export type ChannelEdge = {
  id: string
  from: ChannelEdgeConnection
  to: ChannelEdgeConnection
}

export type ChannelNote = {
  id: string
  coordinates: {
    x: number
    y: number
  }
  text: string
}

export type ChannelEdgeConnection = {
  nodeId: string
  ioId: string
}

export type ChannelRuntime = {
  size: 'small' | 'medium' | 'large'
  // Static memory budget in MiB (64-16384), required by the controller to compile the channel.
  memoryMiB?: number
  // Maximum number of in-flight executions (1-1000), required by the controller to compile the channel.
  maxConcurrentExecutions?: number
}

export type ChannelConfig = {
  id: string
  name: string
  runtime: ChannelRuntime
  nodes: ChannelNode[]
  edges: ChannelEdge[]
  notes: ChannelNote[]
}