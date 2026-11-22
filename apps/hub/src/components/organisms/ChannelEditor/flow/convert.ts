import type { ChannelEdge, ChannelNote } from '@gruent/libs/legacy/engine/channels/channels'
import type { ChannelNode } from '@gruent/libs/legacy/engine/nodes/v1'
import { type Connection, MarkerType } from '@xyflow/react'
import type {
  ChannelFlowEdge,
  ChannelFlowElement,
  ChannelFlowStep,
  ChannelFlowNote,
  ChannelNodeType,
} from './types'

export const GRID_SIZE = 24
// Steps are cards that span whole grid cells, as wide as notes
export const STEP_WIDTH = 192
export const STEP_HEIGHT = 64
export const NOTE_WIDTH = 192
export const NOTE_HEIGHT = 95

// Inputs/outputs that are handled implicitly by the rules engine and are never drawn
export const HIDDEN_INPUT_IDS = ['passThrough']
export const HIDDEN_OUTPUT_IDS = ['httpResponseOutput']

export const stepTypeColor = (type: ChannelNodeType | undefined): string => {
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

type ToFlowStepsParams = {
  steps: Map<string, ChannelNode>
  notes: Map<string, ChannelNote>
  edges: Map<string, ChannelEdge>
  currentStep: ChannelNode | null
  currentEdge: ChannelEdge | null
  currentNote: ChannelNote | null
  stepErrors: Record<string, string[]> | null | undefined
}

/**
 * Maps the editor store (the API-interpretable channel config) to xyflow nodes. Channel notes
 * are rendered as their own xyflow node type so they can be selected and dragged like steps.
 */
export const toFlowSteps = ({
  steps,
  notes,
  edges,
  currentStep,
  currentEdge,
  currentNote,
  stepErrors,
}: ToFlowStepsParams): ChannelFlowElement[] => {
  // Active IO handles are drawn in the color of the step that feeds them, keyed by step ID
  const activeIo = new Map<string, Record<string, string>>()
  const markActive = (stepId: string, handleKey: string, color: string) => {
    activeIo.set(stepId, { ...(activeIo.get(stepId) ?? {}), [handleKey]: color })
  }

  if (currentStep) {
    const color = stepTypeColor(currentStep.metadata.type)
    for (const input of currentStep.metadata.io.inputs)
      markActive(currentStep.id, ioKey('input', input.id), color)
    for (const output of currentStep.metadata.io.outputs)
      markActive(currentStep.id, ioKey('output', output.id), color)
    for (const edge of edges.values()) {
      if (edge.from.nodeId === currentStep.id)
        markActive(edge.to.nodeId, ioKey('input', edge.to.ioId), color)
    }
  }

  if (currentEdge) {
    const color = stepTypeColor(steps.get(currentEdge.from.nodeId)?.metadata.type)
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

  const flowSteps: ChannelFlowStep[] = Array.from(steps.values()).map((step) => ({
    id: step.id,
    type: 'channelStep',
    position: { x: step.coordinates.x, y: step.coordinates.y },
    width: STEP_WIDTH,
    height: STEP_HEIGHT,
    selected: currentStep?.id === step.id,
    data: {
      step,
      errors: stepErrors?.[step.id] ?? [],
      activeIo: activeIo.get(step.id) ?? {},
    },
  }))

  // Notes render above steps, matching the previous canvas draw order
  return [...flowSteps, ...flowNotes]
}

type ToFlowEdgesParams = {
  steps: Map<string, ChannelNode>
  edges: Map<string, ChannelEdge>
  currentStep: ChannelNode | null
  currentEdge: ChannelEdge | null
}

/**
 * Maps channel edges to xyflow edges. A channel edge always flows from an output IO (xyflow
 * "source" handle) to an input IO (xyflow "target" handle), with the IO IDs used as handle IDs.
 */
export const toFlowEdges = ({
  steps,
  edges,
  currentStep,
  currentEdge,
}: ToFlowEdgesParams): ChannelFlowEdge[] =>
  Array.from(edges.values())
    .filter((edge) => steps.has(edge.from.nodeId) && steps.has(edge.to.nodeId))
    .map((edge) => {
      const isActive = currentEdge?.id === edge.id || currentStep?.id === edge.from.nodeId
      const color = isActive
        ? stepTypeColor(steps.get(edge.from.nodeId)?.metadata.type)
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
 * handles, so `connection.source` is always the output step.
 */
export const validateConnection = (
  connection: Connection,
  steps: Map<string, ChannelNode>,
  edges: Map<string, ChannelEdge>,
): ConnectionValidation => {
  const { source, sourceHandle, target, targetHandle } = connection

  if (source === target) return { valid: false, reason: 'Cannot connect a step to itself.' }

  const outputStep = steps.get(source)
  const inputStep = steps.get(target)
  if (!outputStep || !inputStep || !sourceHandle || !targetHandle)
    return { valid: false, reason: 'These two steps cannot be connected.' }

  const output = outputStep.metadata.io.outputs.find((io) => io.id === sourceHandle)
  const input = inputStep.metadata.io.inputs.find((io) => io.id === targetHandle)
  if (!output || !input)
    return {
      valid: false,
      reason: 'Connections must go from an output to an input.',
    }

  const isAllowedInput = inputStep.metadata.io.inputs.some(
    (io) => io.allowedEdge.includes(outputStep.metadata.type) || io.allowedEdge.includes('*'),
  )
  const isAllowedOutput = outputStep.metadata.io.outputs.some(
    (io) => io.allowedEdge.includes(inputStep.metadata.type) || io.allowedEdge.includes('*'),
  )
  if (!isAllowedInput || !isAllowedOutput)
    return { valid: false, reason: 'These two steps cannot be connected.' }

  for (const edge of edges.values()) {
    if (
      edge.from.nodeId === source &&
      edge.from.ioId === sourceHandle &&
      edge.to.nodeId === target &&
      edge.to.ioId === targetHandle
    )
      return { valid: false, reason: 'These two steps are already connected.' }
  }

  return {
    valid: true,
    edge: {
      from: { nodeId: source, ioId: sourceHandle },
      to: { nodeId: target, ioId: targetHandle },
    },
  }
}
