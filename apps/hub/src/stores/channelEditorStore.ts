import {
  ChannelEdge,
  ChannelNote,
  ChannelRuntime,
} from '@gruent/libs/legacy/engine/channels/channels'
import { ChannelNode } from '@gruent/libs/legacy/engine/nodes/v1'
import { create } from 'zustand'

type State = {
  nodes: Map<string, ChannelNode>
  edges: Map<string, ChannelEdge>
  notes: Map<string, ChannelNote>
  channelName: string
  currentNode: ChannelNode | null
  currentEdge: ChannelEdge | null
  currentNote: ChannelNote | null
  runtime: ChannelRuntime
  validationErrors: {
    channelErrors: string[] | null
    nodeErrors: Record<string, string[]> | null
  } | null
  status?: 'PUBLISHED' | 'UNPUBLISHED' | 'INITIALIZING'
}

type Action = {
  reset: () => void
  upsertNode: (nodeId: string, node: ChannelNode) => void
  moveNode: (nodeId: string, coordinates: { x: number; y: number }) => void
  setNodeConfig: (nodeId: string, config: Record<string, unknown>) => void
  removeNode: (nodeId: string) => void
  upsertEdge: (edgeId: string, edge: ChannelEdge) => void
  removeEdge: (edgeId: string) => void
  upsertNote: (noteId: string, note: ChannelNote) => void
  moveNote: (noteId: string, coordinates: { x: number; y: number }) => void
  removeNote: (noteId: string) => void
  setChannelName: (channelName: string) => void
  setCurrentNode: (currentNode: ChannelNode | null) => void
  setCurrentEdge: (edge: ChannelEdge | null) => void
  setCurrentNote: (note: ChannelNote | null) => void
  setRuntime: (runtime: ChannelRuntime) => void
  setValidationErrors: (
    validationErrors: {
      channelErrors: string[] | null
      nodeErrors: Record<string, string[]> | null
    } | null,
  ) => void
  setStatus: (status: 'PUBLISHED' | 'UNPUBLISHED' | 'INITIALIZING') => void
}

const initialState: State = {
  nodes: new Map([]),
  edges: new Map([]),
  notes: new Map([]),
  channelName: '',
  currentNode: null,
  currentEdge: null,
  currentNote: null,
  runtime: {
    size: 'small',
  },
  validationErrors: null,
}

const useChannelEditorStore = create<State & Action>((set, get) => ({
  ...initialState,
  reset: () => set(initialState),
  upsertNode: (nodeId, node) => {
    const nodes = get().nodes
    const updatedNodes = new Map(nodes)
    updatedNodes.delete(nodeId) // deleting plus setting causes the node to go to the top of the map, rendering on top in the editor
    updatedNodes.set(nodeId, node)
    set({ nodes: updatedNodes })
  },
  moveNode: (nodeId, coordinates) => {
    const { nodes, currentNode } = get()
    const node = nodes.get(nodeId)
    if (!node) return
    const updatedNode = { ...node, coordinates }
    const updatedNodes = new Map(nodes)
    updatedNodes.set(nodeId, updatedNode)
    // Keep the selected copy in sync so option panes don't write stale coordinates back
    set({
      nodes: updatedNodes,
      ...(currentNode?.id === nodeId ? { currentNode: updatedNode } : {}),
    })
  },
  setNodeConfig: (nodeId, config) => {
    const { nodes, currentNode } = get()
    const node = nodes.get(nodeId)
    if (!node) return
    const updatedNode = {
      ...node,
      metadata: { ...node.metadata, config: config as ChannelNode['metadata']['config'] },
    }
    const updatedNodes = new Map(nodes)
    updatedNodes.set(nodeId, updatedNode)
    set({
      nodes: updatedNodes,
      ...(currentNode?.id === nodeId ? { currentNode: updatedNode } : {}),
    })
  },
  removeNode: (nodeId) => {
    const { nodes, edges } = get()
    const updatedNodes = new Map(nodes)
    updatedNodes.delete(nodeId)
    // Remove edges attached to the node so the channel config never references a missing node
    const updatedEdges = new Map(
      Array.from(edges).filter(
        ([_, edge]) => edge.from.nodeId !== nodeId && edge.to.nodeId !== nodeId,
      ),
    )
    set({ nodes: updatedNodes, edges: updatedEdges })
  },
  upsertEdge: (edgeId, edge) => {
    const edges = get().edges
    const updatedEdges = new Map(edges)
    updatedEdges.delete(edgeId) // deleting plus setting causes the edge to go to the top of the map, rendering on top in the editor
    updatedEdges.set(edgeId, edge)
    set({ edges: updatedEdges })
  },
  removeEdge: (edgeId) => {
    const edges = get().edges
    const updatedEdges = new Map(edges)
    updatedEdges.delete(edgeId)
    set({ edges: updatedEdges })
  },
  upsertNote: (noteId, note) => {
    const notes = get().notes
    const updatedNotes = new Map(notes)
    updatedNotes.delete(noteId) // deleting plus setting causes the note to go to the top of the map, rendering on top in the editor
    updatedNotes.set(noteId, note)
    set({ notes: updatedNotes })
  },
  moveNote: (noteId, coordinates) => {
    const { notes, currentNote } = get()
    const note = notes.get(noteId)
    if (!note) return
    const updatedNote = { ...note, coordinates }
    const updatedNotes = new Map(notes)
    updatedNotes.set(noteId, updatedNote)
    set({
      notes: updatedNotes,
      ...(currentNote?.id === noteId ? { currentNote: updatedNote } : {}),
    })
  },
  removeNote: (noteId) => {
    const notes = get().notes
    const updatedNotes = new Map(notes)
    updatedNotes.delete(noteId)
    set({ notes: updatedNotes })
  },
  setChannelName: (channelName) => set({ channelName }),
  setCurrentNode: (currentNode) => set({ currentNode, currentEdge: null, currentNote: null }),
  setCurrentEdge: (currentEdge) => set({ currentNode: null, currentEdge, currentNote: null }),
  setCurrentNote: (currentNote) => set({ currentNode: null, currentEdge: null, currentNote }),
  setRuntime: (runtime) => set({ runtime }),
  setValidationErrors: (validationErrors) => set({ validationErrors }),
  setStatus: (status) => set({ status }),
}))

export default useChannelEditorStore
