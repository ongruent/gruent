import {
  ChannelEdge,
  ChannelNote,
  ChannelRuntime,
} from '@gruent/libs/legacy/engine/channels/channels'
import { ChannelNode } from '@gruent/libs/legacy/engine/nodes/v1'
import { Model, Connection } from '@prisma/client'
import { create } from 'zustand'

type State = {
  steps: Map<string, ChannelNode>
  edges: Map<string, ChannelEdge>
  notes: Map<string, ChannelNote>
  channelName: string
  currentStep: ChannelNode | null
  currentEdge: ChannelEdge | null
  currentNote: ChannelNote | null
  runtime: ChannelRuntime
  validationErrors: {
    channelErrors: string[] | null
    stepErrors: Record<string, string[]> | null
  } | null
  status?: 'PUBLISHED' | 'UNPUBLISHED' | 'INITIALIZING'
  models: Model[]
  connections: Connection[]
}

type Action = {
  reset: () => void
  upsertStep: (stepId: string, step: ChannelNode) => void
  moveStep: (stepId: string, coordinates: { x: number; y: number }) => void
  removeStep: (stepId: string) => void
  upsertEdge: (edgeId: string, edge: ChannelEdge) => void
  removeEdge: (edgeId: string) => void
  upsertNote: (noteId: string, note: ChannelNote) => void
  moveNote: (noteId: string, coordinates: { x: number; y: number }) => void
  removeNote: (noteId: string) => void
  setChannelName: (channelName: string) => void
  setCurrentStep: (currentStep: ChannelNode | null) => void
  setCurrentEdge: (edge: ChannelEdge | null) => void
  setCurrentNote: (note: ChannelNote | null) => void
  setRuntime: (runtime: ChannelRuntime) => void
  setValidationErrors: (
    validationErrors: {
      channelErrors: string[] | null
      stepErrors: Record<string, string[]> | null
    } | null,
  ) => void
  setStatus: (status: 'PUBLISHED' | 'UNPUBLISHED' | 'INITIALIZING') => void
  setModels: (models: Model[]) => void
  setConnections: (connections: Connection[]) => void
}

const initialState: State = {
  steps: new Map([]),
  edges: new Map([]),
  notes: new Map([]),
  channelName: '',
  currentStep: null,
  currentEdge: null,
  currentNote: null,
  runtime: {
    size: 'small',
  },
  validationErrors: null,
  models: [],
  connections: [],
}

const useChannelEditorStore = create<State & Action>((set, get) => ({
  ...initialState,
  reset: () => set(initialState),
  upsertStep: (stepId, step) => {
    const steps = get().steps
    const updatedSteps = new Map(steps)
    updatedSteps.delete(stepId) // deleting plus setting causes the step to go to the top of the map, rendering on top in the editor
    updatedSteps.set(stepId, step)
    set({ steps: updatedSteps })
  },
  moveStep: (stepId, coordinates) => {
    const { steps, currentStep } = get()
    const step = steps.get(stepId)
    if (!step) return
    const updatedStep = { ...step, coordinates }
    const updatedSteps = new Map(steps)
    updatedSteps.set(stepId, updatedStep)
    // Keep the selected copy in sync so option panes don't write stale coordinates back
    set({
      steps: updatedSteps,
      ...(currentStep?.id === stepId ? { currentStep: updatedStep } : {}),
    })
  },
  removeStep: (stepId) => {
    const { steps, edges } = get()
    const updatedSteps = new Map(steps)
    updatedSteps.delete(stepId)
    // Remove edges attached to the step so the channel config never references a missing step
    const updatedEdges = new Map(
      Array.from(edges).filter(
        ([_, edge]) => edge.from.nodeId !== stepId && edge.to.nodeId !== stepId,
      ),
    )
    set({ steps: updatedSteps, edges: updatedEdges })
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
  setCurrentStep: (currentStep) => set({ currentStep, currentEdge: null, currentNote: null }),
  setCurrentEdge: (currentEdge) => set({ currentStep: null, currentEdge, currentNote: null }),
  setCurrentNote: (currentNote) => set({ currentStep: null, currentEdge: null, currentNote }),
  setRuntime: (runtime) => set({ runtime }),
  setValidationErrors: (validationErrors) => set({ validationErrors }),
  setStatus: (status) => set({ status }),
  setModels: (models) => set({ models }),
  setConnections: (connections) => set({ connections }),
}))

export default useChannelEditorStore
