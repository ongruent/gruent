'use client'

import '@xyflow/react/dist/style.css'

import useChannelEditorStore from '@gruent/hub/stores/channelEditorStore'
import useSettingsStore from '@gruent/hub/stores/settingsStore'
import { generateEdgeId, generateStepId, generateNoteId } from '@gruent/hub/util/idGenerator'
import type { ChannelNote } from '@gruent/libs/engine/channels/channels'
import type { ChannelNode } from '@gruent/libs/engine/nodes/v1'
import { openModal } from '@gruent/libs/frontend/hooks/useModal'
import { addToast } from '@gruent/libs/frontend/hooks/useToast'
import { CircleAlertIcon, LocateFixedIcon, ZoomInIcon, ZoomOutIcon } from 'lucide-react'
import {
  Background,
  BackgroundVariant,
  type Connection,
  type EdgeMouseHandler,
  type NodeChange,
  type NodeMouseHandler,
  type NodeTypes,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from '@xyflow/react'
import { DragEvent, FC, useCallback, useMemo, useRef } from 'react'
import ChannelValidationErrorModal from './ChannelValidationErrorModal'
import { useChannelEditorKeyboardEvents } from './events/keyboard'
import ChannelStepView from './flow/ChannelStepView'
import ChannelNoteView from './flow/ChannelNoteView'
import { GRID_SIZE, snapToGrid, toFlowEdges, toFlowSteps, validateConnection } from './flow/convert'
import type { ChannelFlowElement } from './flow/types'
import { Button } from '@gruent/libs/frontend/components/core/button'

const MIN_ZOOM = 0.5
const MAX_ZOOM = 1.5
const DEFAULT_VIEWPORT = { x: 0, y: 0, zoom: 1 }

const nodeTypes: NodeTypes = {
  channelStep: ChannelStepView,
  channelNote: ChannelNoteView,
}

const controlButtonClassName =
  'p-1! bg-gray-50! dark:bg-gray-900! border-gray-400! hover:border-green-600! text-gray-500! hover:text-green-600!'

export type EditorHooks = {
  onSave?: () => void
  onExport?: () => void
  onChangeMode?: () => void
}

type Props = {
  hooks?: EditorHooks
}

const ChannelEditorCanvas: FC<Props> = ({ hooks }) => {
  const editorRef = useRef<HTMLDivElement>(null)
  const { screenToFlowPosition, zoomIn, zoomOut, setViewport } = useReactFlow()

  // Set up store
  const steps = useChannelEditorStore((state) => state.steps)
  const edges = useChannelEditorStore((state) => state.edges)
  const notes = useChannelEditorStore((state) => state.notes)
  const currentStep = useChannelEditorStore((state) => state.currentStep)
  const currentEdge = useChannelEditorStore((state) => state.currentEdge)
  const currentNote = useChannelEditorStore((state) => state.currentNote)
  const validationErrors = useChannelEditorStore((state) => state.validationErrors)
  const upsertStep = useChannelEditorStore((state) => state.upsertStep)
  const moveStep = useChannelEditorStore((state) => state.moveStep)
  const upsertEdge = useChannelEditorStore((state) => state.upsertEdge)
  const upsertNote = useChannelEditorStore((state) => state.upsertNote)
  const moveNote = useChannelEditorStore((state) => state.moveNote)
  const setCurrentStep = useChannelEditorStore((state) => state.setCurrentStep)
  const setCurrentEdge = useChannelEditorStore((state) => state.setCurrentEdge)
  const setCurrentNote = useChannelEditorStore((state) => state.setCurrentNote)
  const userTheme = useSettingsStore((state) => state.theme)
  const showChannelEditorGrid = useSettingsStore((state) => state.showChannelEditorGrid)

  // Initialize keyboard events
  useChannelEditorKeyboardEvents(editorRef, {
    onSave: hooks?.onSave,
    onExport: hooks?.onExport,
    onChangeMode: hooks?.onChangeMode,
  })

  // Derive the xyflow graph from the channel config held in the store
  const flowSteps = useMemo(
    () =>
      toFlowSteps({
        steps,
        notes,
        edges,
        currentStep,
        currentEdge,
        currentNote,
        stepErrors: validationErrors?.stepErrors,
      }),
    [steps, notes, edges, currentStep, currentEdge, currentNote, validationErrors],
  )

  const flowEdges = useMemo(
    () => toFlowEdges({ steps, edges, currentStep, currentEdge }),
    [steps, edges, currentStep, currentEdge],
  )

  // Selection is owned by the store, so only position changes need to be written back
  const handleStepsChange = useCallback(
    (changes: NodeChange<ChannelFlowElement>[]) => {
      for (const change of changes) {
        if (change.type !== 'position' || !change.position) continue

        const coordinates = { x: change.position.x, y: change.position.y }
        if (steps.has(change.id)) moveStep(change.id, coordinates)
        else if (notes.has(change.id)) moveNote(change.id, coordinates)
      }
    },
    [steps, notes, moveStep, moveNote],
  )

  const selectElement = useCallback(
    (id: string) => {
      const step = steps.get(id)
      if (step) {
        if (currentStep?.id !== id) setCurrentStep(step)
        return
      }

      const note = notes.get(id)
      if (note && currentNote?.id !== id) setCurrentNote(note)
    },
    [steps, notes, currentStep, currentNote, setCurrentStep, setCurrentNote],
  )

  const handleStepClick: NodeMouseHandler<ChannelFlowElement> = useCallback(
    (_, step) => selectElement(step.id),
    [selectElement],
  )

  const handleEdgeClick: EdgeMouseHandler = useCallback(
    (_, edge) => setCurrentEdge(edges.get(edge.id) ?? null),
    [edges, setCurrentEdge],
  )

  const clearSelection = useCallback(() => {
    setCurrentStep(null)
    setCurrentEdge(null)
    setCurrentNote(null)
  }, [setCurrentStep, setCurrentEdge, setCurrentNote])

  const handleConnect = useCallback(
    (connection: Connection) => {
      const result = validateConnection(connection, steps, edges)
      if (!result.valid) {
        addToast({ title: 'Could not create edge', body: result.reason, level: 'warning' })
        return
      }

      const edgeId = generateEdgeId()
      upsertEdge(edgeId, { id: edgeId, ...result.edge })
    },
    [steps, edges, upsertEdge],
  )

  const handleDragOver = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
      // Reset the selection to ensure the options pane state resets
      if (currentStep || currentEdge) {
        setCurrentStep(null)
        setCurrentEdge(null)
      }
    },
    [currentStep, currentEdge, setCurrentStep, setCurrentEdge],
  )

  // Add steps and notes dragged in from the step library pane
  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault()

      const dropData = e.dataTransfer.getData('application/json')
      if (!dropData) return

      let parsedDropData: unknown
      try {
        parsedDropData = JSON.parse(dropData)
      } catch {
        return
      }
      if (!parsedDropData || typeof parsedDropData !== 'object') return

      const position = screenToFlowPosition({ x: e.clientX, y: e.clientY })
      const coordinates = { x: snapToGrid(position.x), y: snapToGrid(position.y) }

      if ('metadata' in parsedDropData) {
        const newStep = { ...(parsedDropData as ChannelNode), id: generateStepId(), coordinates }
        upsertStep(newStep.id, newStep)
        setCurrentStep(newStep)
        return
      }

      if ('id' in parsedDropData && parsedDropData.id === '__GRUENT_NOTE__') {
        const newNote = { ...(parsedDropData as ChannelNote), id: generateNoteId(), coordinates }
        upsertNote(newNote.id, newNote)
        setCurrentNote(newNote)
      }
    },
    [screenToFlowPosition, upsertStep, setCurrentStep, upsertNote, setCurrentNote],
  )

  return (
    <div
      ref={editorRef}
      tabIndex={0}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className="relative grow flex flex-col focus:outline-hidden bg-gray-50 dark:bg-[#1c1d1c] [--channel-editor-idle-color:var(--color-gray-400)] dark:[--channel-editor-idle-color:var(--color-gray-100)]"
      data-testid="channel-editor"
    >
      <ChannelValidationErrorModal />
      {validationErrors &&
        validationErrors.channelErrors &&
        validationErrors.channelErrors.length > 0 && (
          <CircleAlertIcon
            size="1.5em"
            className="text-error absolute right-7 top-7 cursor-pointer select-none z-10"
            onClick={() => openModal('channelValidationErrors')}
          />
        )}

      <ReactFlow<ChannelFlowElement>
        nodes={flowSteps}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        onNodesChange={handleStepsChange}
        onNodeClick={handleStepClick}
        onNodeDragStart={handleStepClick}
        onEdgeClick={handleEdgeClick}
        onPaneClick={clearSelection}
        onConnect={handleConnect}
        colorMode={userTheme === 'dark' ? 'dark' : 'light'}
        defaultViewport={DEFAULT_VIEWPORT}
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
        snapToGrid
        snapGrid={[GRID_SIZE, GRID_SIZE]}
        connectionLineStyle={{ stroke: 'var(--color-primary)', strokeWidth: 1.5 }}
        // Deletion and selection are handled through the store (see events/keyboard.tsx)
        deleteKeyCode={null}
        selectionKeyCode={null}
        multiSelectionKeyCode={null}
        style={{ backgroundColor: 'transparent' }}
      >
        {showChannelEditorGrid && (
          <Background
            variant={BackgroundVariant.Dots}
            gap={GRID_SIZE}
            size={2}
            color={userTheme === 'dark' ? '#3a3a3a' : '#e8e8e8'}
          />
        )}
      </ReactFlow>

      <div className="absolute left-8 bottom-6 flex flex-col gap-1 z-10">
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="icon"
            aria-label="Zoom in"
            className={controlButtonClassName}
            onClick={() => zoomIn({ duration: 150 })}
          >
            <ZoomInIcon />
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Zoom out"
            className={controlButtonClassName}
            onClick={() => zoomOut({ duration: 150 })}
          >
            <ZoomOutIcon />
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Reset view"
            className={controlButtonClassName}
            onClick={() => setViewport(DEFAULT_VIEWPORT, { duration: 150 })}
          >
            <LocateFixedIcon />
          </Button>
        </div>
      </div>
    </div>
  )
}

const ChannelEditor: FC<Props> = (props) => (
  <ReactFlowProvider>
    <ChannelEditorCanvas {...props} />
  </ReactFlowProvider>
)

export default ChannelEditor
