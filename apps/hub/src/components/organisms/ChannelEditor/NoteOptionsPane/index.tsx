import useChannelEditorStore from '@gruent/hub/stores/channelEditorStore'
import { Textarea } from '@gruent/libs/frontend/components/core/textarea'
import { StickyNoteIcon } from 'lucide-react'
import { FC, useCallback } from 'react'
import InspectorSection from '../InspectorSection'

const NoteOptionsPane: FC = () => {
  // set up store
  const currentNote = useChannelEditorStore((state) => state.currentNote)
  const upsertNote = useChannelEditorStore((state) => state.upsertNote)
  const setCurrentNote = useChannelEditorStore((state) => state.setCurrentNote)

  const handleUpdateNote = useCallback(
    (text: string) => {
      if (!currentNote) return

      const updatedNote = {
        ...currentNote,
        text,
      }

      // Update note
      upsertNote(currentNote.id, updatedNote)

      // Update current note
      setCurrentNote(updatedNote)
    },
    [currentNote, upsertNote, setCurrentNote],
  )

  return (
    <InspectorSection
      data-testid="note-options"
      title="Note"
      description="Shown on the canvas only"
      media={
        <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-400">
          <StickyNoteIcon className="size-[18px]" />
        </div>
      }
    >
      <Textarea
        aria-label="Note text"
        placeholder="Write a note…"
        className="min-h-28"
        value={currentNote?.text ?? ''}
        onChange={(e) => handleUpdateNote(e.target.value)}
      />
    </InspectorSection>
  )
}

export default NoteOptionsPane
