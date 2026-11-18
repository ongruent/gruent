'use client'

import { Handle, type NodeProps, Position } from '@xyflow/react'
import { CircleAlertIcon } from 'lucide-react'
import { memo } from 'react'
import { HIDDEN_INPUT_IDS, HIDDEN_OUTPUT_IDS, ioKey } from './convert'
import { NodeCategoryIcon, NodeTypeIcon } from './nodeIcons'
import type { ChannelFlowNode, ChannelNodeType } from './types'

// Horizontal spacing between output handles, in px
const OUTPUT_SPACING = 30

type NodeStyle = {
  container: string
  selectedContainer: string
  tab: string
  selectedTab: string
  typeText: string
  labelText: string
}

const nodeStyles: Record<ChannelNodeType | 'default', NodeStyle> = {
  source: {
    container: 'border-green-200',
    selectedContainer: 'border-green-500',
    tab: 'bg-green-400 border-green-200',
    selectedTab: 'bg-green-500 border-green-500',
    typeText: 'text-green-700 dark:text-gray-50',
    labelText: 'text-green-800 dark:text-white',
  },
  processing: {
    container: 'border-blue-200',
    selectedContainer: 'border-blue-500',
    tab: 'bg-blue-400 border-blue-200',
    selectedTab: 'bg-blue-500 border-blue-500',
    typeText: 'text-blue-700 dark:text-gray-50',
    labelText: 'text-blue-900 dark:text-white',
  },
  action: {
    container: 'border-red-200',
    selectedContainer: 'border-red-500',
    tab: 'bg-red-400 border-red-200',
    selectedTab: 'bg-red-500 border-red-500',
    typeText: 'text-red-700 dark:text-gray-50',
    labelText: 'text-red-800 dark:text-white',
  },
  conditional: {
    container: 'border-orange-200',
    selectedContainer: 'border-orange-500',
    tab: 'bg-orange-400 border-orange-200',
    selectedTab: 'bg-orange-500 border-orange-500',
    typeText: 'text-orange-700 dark:text-gray-50',
    labelText: 'text-orange-900 dark:text-white',
  },
  custom: {
    container: 'border-violet-200',
    selectedContainer: 'border-violet-500',
    tab: 'bg-violet-400 border-violet-200',
    selectedTab: 'bg-violet-500 border-violet-500',
    typeText: 'text-violet-700 dark:text-gray-50',
    labelText: 'text-violet-900 dark:text-white',
  },
  default: {
    container: 'border-gray-300 dark:border-gray-400',
    selectedContainer: 'border-gray-600 dark:border-gray-300',
    tab: 'bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-400',
    selectedTab: 'bg-gray-600 dark:bg-gray-300 border-gray-600 dark:border-gray-300',
    typeText: 'text-gray-500 dark:text-gray-400',
    labelText: 'text-gray-800 dark:text-gray-200',
  },
}

const ChannelNodeView = ({ data, selected }: NodeProps<ChannelFlowNode>) => {
  const { node, errors, activeIo } = data
  const { type, name, io } = node.metadata
  const style = nodeStyles[type] ?? nodeStyles.default
  const idleIoColor = 'var(--channel-editor-idle-color)'

  return (
    <div
      className={`relative w-[90px] h-[90px] rounded-[3px] border bg-gray-50 dark:bg-gray-900 shadow-[0_4px_8px_rgba(1,1,3,0.05)] cursor-pointer ${
        selected ? style.selectedContainer : style.container
      }`}
      data-testid={`channel-node-${node.id}`}
    >
      {/* Type tab */}
      <div
        className={`absolute -left-[17.5px] -top-px -bottom-px w-[17.5px] border flex items-center justify-center text-white ${
          selected ? style.selectedTab : style.tab
        }`}
      >
        <NodeTypeIcon type={type} className="shrink-0" />
      </div>

      {/* Validation errors */}
      {errors.length > 0 && (
        <span title={errors.join('\n')} className="absolute -left-[42px] top-0 text-error">
          <CircleAlertIcon size="1.5em" />
        </span>
      )}

      <p
        className={`absolute left-[5px] top-[5px] right-[5px] text-[8px] leading-[10px] truncate ${style.typeText}`}
      >
        {name}
      </p>
      <NodeCategoryIcon
        type={type}
        className={`absolute left-[21px] top-[24px] w-12 h-12 text-base ${style.labelText}`}
      />

      {/* Inputs */}
      {io.inputs
        .filter((input) => !HIDDEN_INPUT_IDS.includes(input.id))
        .map((input) => (
          <Handle
            key={input.id}
            id={input.id}
            type="target"
            position={Position.Top}
            className="channel-editor-handle w-6! h-3! min-w-0! min-h-0! bg-transparent! border-0! rounded-none! flex items-center"
          >
            <span
              className="pointer-events-none block w-5 h-1 mx-auto"
              style={{ backgroundColor: activeIo[ioKey('input', input.id)] ?? idleIoColor }}
            />
          </Handle>
        ))}

      {/* Outputs */}
      {io.outputs.map((output, index) => {
        if (HIDDEN_OUTPUT_IDS.includes(output.id)) return null

        const totalWidth = (io.outputs.length - 1) * OUTPUT_SPACING
        const offsetX = index * OUTPUT_SPACING - totalWidth / 2

        return (
          <Handle
            key={output.id}
            id={output.id}
            type="source"
            position={Position.Bottom}
            style={{ left: `calc(50% + ${offsetX}px)` }}
            className="channel-editor-handle w-3.5! h-3.5! min-w-0! min-h-0! bg-transparent! border-0! flex items-center justify-center"
          >
            <span
              className="pointer-events-none block w-[9px] h-[9px] rounded-full"
              style={{ backgroundColor: activeIo[ioKey('output', output.id)] ?? idleIoColor }}
            />
            {type === 'conditional' && (
              <span
                className={`pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 text-[9px] leading-none ${style.typeText}`}
              >
                {output.id}
              </span>
            )}
          </Handle>
        )
      })}
    </div>
  )
}

export default memo(ChannelNodeView)
