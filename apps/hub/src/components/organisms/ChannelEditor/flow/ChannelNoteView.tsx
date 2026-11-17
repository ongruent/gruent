'use client'

import type { NodeProps } from '@xyflow/react'
import { memo } from 'react'
import type { ChannelFlowNote } from './types'

const ChannelNoteView = ({ data, selected }: NodeProps<ChannelFlowNote>) => (
  <div
    className={`w-[192px] h-[95px] overflow-hidden px-2.5 py-1.5 bg-gray-50 dark:bg-gray-900 border-gray-700 dark:border-gray-100 cursor-pointer ${
      selected ? 'border-2' : 'border'
    }`}
    data-testid={`channel-note-${data.note.id}`}
  >
    <p className="text-[9px] text-gray-500 dark:text-gray-400">NOTE</p>
    <p className="text-sm leading-5 text-gray-800 dark:text-gray-200 whitespace-pre-wrap wrap-break-word">
      {data.note.text}
    </p>
  </div>
)

export default memo(ChannelNoteView)
