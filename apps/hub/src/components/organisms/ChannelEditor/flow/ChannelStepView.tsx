'use client'

import { Handle, type NodeProps, Position } from '@xyflow/react'
import { cn } from 'cn'
import { CircleAlertIcon } from 'lucide-react'
import { memo } from 'react'
import { pluginIdentity } from '../pluginNodes'
import { HIDDEN_INPUT_IDS, HIDDEN_OUTPUT_IDS, ioKey } from './convert'
import { StepCategoryIcon } from './stepIcons'
import { stepCategoryStyle } from './stepStyles'
import type { ChannelFlowStep } from './types'

// Horizontal spacing between output handles, in px
const OUTPUT_SPACING = 36

const ChannelStepView = ({ data, selected }: NodeProps<ChannelFlowStep>) => {
  const { step, errors, activeIo } = data
  const { type, name, io } = step.metadata
  const style = stepCategoryStyle(type)
  const identity = pluginIdentity(step)
  const idleIoColor = 'var(--channel-editor-idle-color)'
  const hasErrors = errors.length > 0
  const visibleOutputs = io.outputs.filter((output) => !HIDDEN_OUTPUT_IDS.includes(output.id))

  return (
    <div
      className={cn(
        'group relative flex h-[64px] w-[192px] cursor-pointer items-center gap-3 rounded-lg border bg-card px-3 text-card-foreground shadow-xs transition-shadow hover:shadow-md',
        hasErrors && 'border-destructive/60',
        selected && ['ring-2 ring-offset-2 ring-offset-background', style.ring],
      )}
      data-testid={`channel-step-${step.id}`}
    >
      <div
        className={cn('flex size-9 shrink-0 items-center justify-center rounded-md', style.chip)}
      >
        <StepCategoryIcon type={type} className="size-[18px]" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm leading-5 font-medium" title={name}>
          {name}
        </p>
        <p className="truncate text-xs leading-4 text-muted-foreground">
          {style.label}
          {identity && ` · v${identity.pluginVersion}`}
        </p>
      </div>

      {/* Validation errors */}
      {hasErrors && (
        <span
          title={errors.join('\n')}
          aria-label={`${errors.length} validation ${errors.length === 1 ? 'error' : 'errors'}`}
          className="absolute -top-2 -right-2 flex size-5 items-center justify-center rounded-full bg-card text-destructive"
        >
          <CircleAlertIcon className="size-5" />
        </span>
      )}

      {/* Inputs */}
      {io.inputs
        .filter((input) => !HIDDEN_INPUT_IDS.includes(input.id))
        .map((input) => (
          <Handle
            key={input.id}
            id={input.id}
            type="target"
            position={Position.Top}
            className="channel-editor-handle w-8! h-3! min-w-0! min-h-0! bg-transparent! border-0! rounded-none! flex items-center justify-center"
          >
            <span
              className="pointer-events-none block h-1.5 w-5 rounded-full ring-2 ring-card"
              style={{ backgroundColor: activeIo[ioKey('input', input.id)] ?? idleIoColor }}
            />
          </Handle>
        ))}

      {/* Outputs */}
      {visibleOutputs.map((output, index) => {
        const totalWidth = (visibleOutputs.length - 1) * OUTPUT_SPACING
        const offsetX = index * OUTPUT_SPACING - totalWidth / 2

        return (
          <Handle
            key={output.id}
            id={output.id}
            type="source"
            position={Position.Bottom}
            style={{ left: `calc(50% + ${offsetX}px)` }}
            className="channel-editor-handle w-4! h-4! min-w-0! min-h-0! bg-transparent! border-0! flex items-center justify-center"
          >
            <span
              className="pointer-events-none block size-2.5 rounded-full ring-2 ring-card transition-transform group-hover:scale-125"
              style={{ backgroundColor: activeIo[ioKey('output', output.id)] ?? idleIoColor }}
            />
            {type === 'conditional' && (
              <span className="pointer-events-none absolute top-4 left-1/2 -translate-x-1/2 rounded-sm bg-background/80 px-1 text-[10px] leading-4 whitespace-nowrap text-muted-foreground">
                {output.id}
              </span>
            )}
          </Handle>
        )
      })}
    </div>
  )
}

export default memo(ChannelStepView)
