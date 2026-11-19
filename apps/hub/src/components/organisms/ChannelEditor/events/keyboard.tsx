'use client'

import useChannelEditorStore from '@gruent/hub/stores/channelEditorStore'
import { addToast } from '@gruent/libs/frontend/hooks/useToast'
import { useKeyDown } from '@react-hooks-library/core'
import { RefObject, useEffect, useRef } from 'react'
import { EditorHooks } from '..'

export const useChannelEditorKeyboardEvents = (
  editorRef: RefObject<HTMLDivElement | null>,
  hooks?: EditorHooks,
) => {
  // Track whether the editor canvas was the last connection the user interacted with. xyflow can
  // re-render the element under the pointer (e.g. a newly selected edge), which drops focus to
  // <body>, so focus alone is not a reliable signal.
  const isEditorActive = useRef(false)

  useEffect(() => {
    const handlePointerDown = (e: PointerEvent) => {
      isEditorActive.current = !!editorRef.current?.contains(e.target as Node)
    }
    const handleFocusIn = (e: FocusEvent) => {
      if (!editorRef.current?.contains(e.target as Node)) isEditorActive.current = false
    }

    document.addEventListener('pointerdown', handlePointerDown, true)
    document.addEventListener('focusin', handleFocusIn)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true)
      document.removeEventListener('focusin', handleFocusIn)
    }
  }, [editorRef])

  // Only handle editing shortcuts while the editor canvas is in use (e.g. not while typing in a form)
  const isEditorFocused = () => {
    const activeElement = document.activeElement
    const isFocusInEditor =
      !activeElement ||
      activeElement === document.body ||
      !!editorRef.current?.contains(activeElement)
    return isEditorActive.current && isFocusInEditor
  }

  // set up store
  const currentStep = useChannelEditorStore((state) => state.currentStep)
  const removeStep = useChannelEditorStore((state) => state.removeStep)
  const setCurrentStep = useChannelEditorStore((state) => state.setCurrentStep)
  const removeEdge = useChannelEditorStore((state) => state.removeEdge)
  const currentEdge = useChannelEditorStore((state) => state.currentEdge)
  const setCurrentEdge = useChannelEditorStore((state) => state.setCurrentEdge)
  const currentNote = useChannelEditorStore((state) => state.currentNote)
  const setCurrentNote = useChannelEditorStore((state) => state.setCurrentNote)
  const removeNote = useChannelEditorStore((state) => state.removeNote)

  const handleDeleteKeypress = () => {
    if (!isEditorFocused()) return

    if (currentStep) {
      // update steps map (attached edges are removed with the step)
      removeStep(currentStep.id)

      // reset current step
      setCurrentStep(null)
    }

    if (currentNote) {
      // update notes map
      removeNote(currentNote.id)

      // reset current edge
      setCurrentNote(null)
    }

    if (currentEdge) {
      // update edges map
      removeEdge(currentEdge.id)

      // reset current edge
      setCurrentEdge(null)
    }
  }

  const handleSaveKeypress = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault()
      hooks?.onSave?.()
    }
  }

  const handleExportKeypress = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
      e.preventDefault()
      hooks?.onExport?.()
    }
  }

  const handleModeKeypress = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
      e.preventDefault()
      hooks?.onChangeMode?.()
    }
  }

  const handleUndoKeypress = (e: KeyboardEvent) => {
    if (!isEditorFocused()) return

    // Handle redo (shift)
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'z') {
      e.preventDefault()
      addToast({
        title: 'Coming soon',
        body: 'Redo is coming soon!',
        level: 'info',
      })
      return
    }

    // Handle undo (no shift)
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      e.preventDefault()
      addToast({
        title: 'Coming soon',
        body: 'Undo is coming soon!',
        level: 'info',
      })
    }
  }

  const handleCopyKeypress = (e: KeyboardEvent) => {
    if (!isEditorFocused()) return

    // Handle copy
    if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
      e.preventDefault()
      addToast({
        title: 'Coming soon',
        body: 'Copying steps is coming soon!',
        level: 'info',
      })
    }
  }

  const handlePasteKeypress = (e: KeyboardEvent) => {
    if (!isEditorFocused()) return

    // Handle paste
    if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
      e.preventDefault()
      addToast({
        title: 'Coming soon',
        body: 'Pasting steps is coming soon!',
        level: 'info',
      })
    }
  }

  const handleDuplicateKeypress = (e: KeyboardEvent) => {
    // Handle paste
    if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
      e.preventDefault()
      addToast({
        title: 'Coming soon',
        body: 'Duplicating steps is coming soon!',
        level: 'info',
      })
    }
  }

  useKeyDown(['Delete', 'Backspace'], handleDeleteKeypress)
  useKeyDown(['s'], handleSaveKeypress)
  useKeyDown(['e'], handleExportKeypress)
  useKeyDown(['i'], handleModeKeypress)
  useKeyDown(['z'], handleUndoKeypress)
  useKeyDown(['c'], handleCopyKeypress)
  useKeyDown(['v'], handlePasteKeypress)
  useKeyDown(['d'], handleDuplicateKeypress)

  return { handleDeleteKeypress }
}
