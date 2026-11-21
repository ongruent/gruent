'use client'

import gruentClient from '@gruent/hub/lib/gruent'
import { Channel } from '@prisma/client'
import { FC, useCallback, useEffect, useId, useState } from 'react'
import useChannelConfig, {
  RUNTIME_MAX_CONCURRENT_EXECUTIONS_LIMITS,
  RUNTIME_MEMORY_MIB_LIMITS,
} from '@gruent/libs/frontend/hooks/useChannelConfig'
import useChannelEditorStore from '@gruent/hub/stores/channelEditorStore'
import { useDebounce } from '@react-hooks-library/core'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@gruent/libs/frontend/components/core/field'
import { Input } from '@gruent/libs/frontend/components/core/input'
import useAuth from '@gruent/hub/hooks/useAuth'
import { CpuIcon } from 'lucide-react'
import InspectorSection from '../InspectorSection'

const formatNumber = (value: number) => value.toLocaleString('en-US')

type ResourceFieldProps = {
  label: string
  description: string
  unit: string
  value: number
  limits: { min: number; max: number }
  onChange: (value: number) => void
}

/**
 * A whole-number resource setting. The typed text is kept locally so the field can be cleared while editing;
 * only whole numbers within the controller's limits are written to the channel.
 */
const ResourceField: FC<ResourceFieldProps> = ({
  label,
  description,
  unit,
  value,
  limits,
  onChange,
}) => {
  const id = useId()
  const [draft, setDraft] = useState(String(value))
  const [previousValue, setPreviousValue] = useState(value)
  if (value !== previousValue) {
    // The channel changed elsewhere (e.g. it was loaded), so show its value
    setPreviousValue(value)
    setDraft(String(value))
  }

  const parsed = Number(draft)
  const valid =
    draft.trim() !== '' && Number.isInteger(parsed) && parsed >= limits.min && parsed <= limits.max

  return (
    <Field data-invalid={!valid}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="relative">
        <Input
          id={id}
          type="number"
          inputMode="numeric"
          min={limits.min}
          max={limits.max}
          step={1}
          value={draft}
          aria-invalid={!valid}
          className="pr-24 tabular-nums"
          onChange={(e) => {
            const text = e.target.value
            setDraft(text)
            const next = Number(text)
            if (
              text.trim() !== '' &&
              Number.isInteger(next) &&
              next >= limits.min &&
              next <= limits.max
            ) {
              setPreviousValue(next)
              onChange(next)
            }
          }}
        />
        <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted-foreground">
          {unit}
        </span>
      </div>
      <FieldDescription>{description}</FieldDescription>
      {!valid && (
        <FieldError>
          Enter a whole number from {formatNumber(limits.min)} to {formatNumber(limits.max)}. The
          channel keeps {formatNumber(value)} {unit} until then.
        </FieldError>
      )}
    </Field>
  )
}

type Props = {
  channel: Channel
  spaceId: string
}

const ChannelOptionsPane: FC<Props> = ({ channel, spaceId }) => {
  const { accessToken } = useAuth()

  // set up store
  const steps = useChannelEditorStore((state) => state.steps)
  const edges = useChannelEditorStore((state) => state.edges)
  const notes = useChannelEditorStore((state) => state.notes)
  const runtime = useChannelEditorStore((state) => state.runtime)
  const setRuntime = useChannelEditorStore((state) => state.setRuntime)
  const setValidationErrors = useChannelEditorStore((state) => state.setValidationErrors)

  const channelConfig = useChannelConfig(channel.id, channel.name, runtime, steps, edges, notes)

  const debouncedChannelConfig = useDebounce(channelConfig, 500) // 500ms delay

  // validate channel on page load and on every config change
  const validateChannel = useCallback(async () => {
    if (!accessToken) return
    if (debouncedChannelConfig.nodes.length === 0) return

    const { data: validationErrors } = await gruentClient(accessToken).channels.validate(
      spaceId,
      debouncedChannelConfig,
    )

    setValidationErrors(validationErrors) // will be null if there are no validation errors
  }, [debouncedChannelConfig, spaceId, accessToken, setValidationErrors])

  useEffect(() => {
    validateChannel()
  }, [validateChannel])

  const memoryMiB = channelConfig.runtime.memoryMiB as number
  const maxConcurrentExecutions = channelConfig.runtime.maxConcurrentExecutions as number

  // The legacy runtime size is kept as saved; only the resource settings are edited here
  const handleChangeRuntime = useCallback(
    (settings: { memoryMiB?: number; maxConcurrentExecutions?: number }) =>
      setRuntime({ ...channelConfig.runtime, ...settings }),
    [channelConfig.runtime, setRuntime],
  )

  return (
    <InspectorSection
      className="border-b-0"
      data-testid="channel-options"
      title="Resources"
      description={`${formatNumber(memoryMiB)} MiB memory · ${formatNumber(maxConcurrentExecutions)} concurrent ${maxConcurrentExecutions === 1 ? 'execution' : 'executions'}`}
      media={
        <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <CpuIcon className="size-[18px]" />
        </div>
      }
    >
      <FieldGroup className="gap-5">
        <ResourceField
          label="Memory"
          unit="MiB"
          description="Static memory budget for this channel's runtime. The full budget is reserved."
          value={memoryMiB}
          limits={RUNTIME_MEMORY_MIB_LIMITS}
          onChange={(value) => handleChangeRuntime({ memoryMiB: value })}
        />
        <ResourceField
          label="Concurrent executions"
          unit="executions"
          description="Maximum number of executions in flight at once. Work beyond this limit is handled by each source's overflow behavior."
          value={maxConcurrentExecutions}
          limits={RUNTIME_MAX_CONCURRENT_EXECUTIONS_LIMITS}
          onChange={(value) => handleChangeRuntime({ maxConcurrentExecutions: value })}
        />
      </FieldGroup>
    </InspectorSection>
  )
}

export default ChannelOptionsPane
