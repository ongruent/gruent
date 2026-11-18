import type {
  ChannelConfig,
  ChannelEdge,
  ChannelNote,
  ChannelRuntime,
} from '@gruent/libs/legacy/engine/channels/index'
import type { ChannelNode } from '@gruent/libs/legacy/engine/nodes/v1'
import { useMemo } from 'react'

const useChannelConfig = (
  id: string,
  name: string,
  runtime: ChannelRuntime,
  nodes: Map<string, ChannelNode>,
  edges: Map<string, ChannelEdge>,
  notes: Map<string, ChannelNote>,
) => {
  const channelConfig = useMemo<ChannelConfig>(() => {
    const nodesArray = Array.from(nodes.values())
    const edgesArray = Array.from(edges.values())
    const notesArray = Array.from(notes.values())

    return {
      id,
      name,
      runtime,
      nodes: nodesArray,
      edges: edgesArray,
      notes: notesArray,
    }
  }, [id, name, runtime, nodes, edges, notes])

  return channelConfig
}

export default useChannelConfig
