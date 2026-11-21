'use client'

import type { NodeProps } from '@xyflow/react'
import { cn } from 'cn'
import { StickyNoteIcon } from 'lucide-react'
import { memo } from 'react'
import type { ChannelFlowNote } from './types'

const ChannelNoteView = ({ data, selected }: NodeProps<ChannelFlowNote>) => (
  <div
    className={cn(
      'h-[95px] w-[192px] cursor-pointer overflow-hidden rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2 shadow-xs transition-shadow hover:shadow-md dark:border-yellow-900 dark:bg-yellow-950/40',
      selected && 'ring-2 ring-yellow-500 ring-offset-2 ring-offset-background',
    )}
    data-testid={`channel-note-${data.note.id}`}
  >
    <p className="mb-0.5 flex items-center gap-1 text-[10px] font-medium tracking-wide text-yellow-800 uppercase dark:text-yellow-400">
      <StickyNoteIcon className="size-3" /> Note
    </p>
    <p
      className={cn(
        'line-clamp-3 text-sm leading-5 whitespace-pre-wrap wrap-break-word',
        data.note.text ? 'text-foreground' : 'text-muted-foreground italic',
      )}
    >
      {data.note.text || 'Empty note'}
    </p>
  </div>
)

export default memo(ChannelNoteView)
