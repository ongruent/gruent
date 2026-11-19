import { useMemo } from 'react'
import type { ChannelNode } from '@gruent/libs/legacy/engine/nodes/v1'

import type {
  ChannelConfig,
  ChannelEdge,
  ChannelNote,
  ChannelRuntime,
} from '@gruent/libs/engine/channels/index'

// Temporary static resource settings until the editor lets users configure them. The controller
// requires both to compile a channel and never chooses them itself (see services/controller/README.md).
export const STATIC_RUNTIME_MEMORY_MIB = 512
export const STATIC_RUNTIME_MAX_CONCURRENT_EXECUTIONS = 10

const isConfigured = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value)

// Fills in the static resource settings, keeping any values the channel already has.
export const withStaticRuntimeSettings = (runtime?: ChannelRuntime | null): ChannelRuntime => ({
  ...(runtime ?? { size: 'small' }),
  memoryMiB: isConfigured(runtime?.memoryMiB) ? runtime.memoryMiB : STATIC_RUNTIME_MEMORY_MIB,
  maxConcurrentExecutions: isConfigured(runtime?.maxConcurrentExecutions)
    ? runtime.maxConcurrentExecutions
    : STATIC_RUNTIME_MAX_CONCURRENT_EXECUTIONS,
})

const useChannelConfig = (
  id: string,
  name: string,
  runtime: ChannelRuntime,
  steps: Map<string, ChannelNode>,
  edges: Map<string, ChannelEdge>,
  notes: Map<string, ChannelNote>,
) => {
  const channelConfig = useMemo<ChannelConfig>(() => {
    const stepsArray = Array.from(steps.values())
    const edgesArray = Array.from(edges.values())
    const notesArray = Array.from(notes.values())

    return {
      id,
      name,
      runtime: withStaticRuntimeSettings(runtime),
      nodes: stepsArray,
      edges: edgesArray,
      notes: notesArray,
    }
  }, [id, name, runtime, steps, edges, notes])

  return channelConfig
}

export default useChannelConfig
