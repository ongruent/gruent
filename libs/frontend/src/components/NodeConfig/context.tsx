'use client'

import type { Definition } from '@gruent/libs/engine/nodes/ts'
import { createContext, FC, PropsWithChildren, useContext, useEffect, useState } from 'react'

/** Anything that resolves an exact plugin identity, such as DefinitionResolver from the node library. */
export type NodeDefinitionSource = {
  resolve: (pluginType: string, pluginVersion: number) => Promise<Definition>
}

const NodeDefinitionsContext = createContext<NodeDefinitionSource | null>(null)

/** Supplies the runtime definition resolver used by every <NodeConfig /> below it. */
export const NodeDefinitionsProvider: FC<PropsWithChildren<{ source: NodeDefinitionSource }>> = ({
  source,
  children,
}) => <NodeDefinitionsContext.Provider value={source}>{children}</NodeDefinitionsContext.Provider>

export type NodeDefinitionState =
  | { status: 'loading' }
  | { status: 'ready'; definition: Definition }
  | { status: 'error'; error: Error }

/** Resolves the exact (pluginType, pluginVersion) pair. A missing version is an error, never a fallback. */
export const useNodeDefinition = (
  pluginType: string,
  pluginVersion: number,
): NodeDefinitionState => {
  const source = useContext(NodeDefinitionsContext)
  const [state, setState] = useState<NodeDefinitionState & { key?: string }>({ status: 'loading' })
  const key = `${pluginType}@${pluginVersion}`

  useEffect(() => {
    if (!source) {
      setState({
        key,
        status: 'error',
        error: new Error('No node definition source is configured.'),
      })
      return
    }
    let cancelled = false
    setState({ key, status: 'loading' })
    source.resolve(pluginType, pluginVersion).then(
      (definition) => !cancelled && setState({ key, status: 'ready', definition }),
      (error: unknown) =>
        !cancelled &&
        setState({
          key,
          status: 'error',
          error: error instanceof Error ? error : new Error(String(error)),
        }),
    )
    return () => {
      cancelled = true
    }
  }, [source, key, pluginType, pluginVersion])

  // Never expose a definition resolved for a previous identity while the new one loads.
  return state.key === key ? state : { status: 'loading' }
}
