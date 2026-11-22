import { cn } from 'cn'
import {
  CircleCheckIcon,
  CircleDashedIcon,
  CircleSlashIcon,
  CircleXIcon,
  TimerOffIcon,
  type LucideIcon,
} from 'lucide-react'
import { FC } from 'react'

type ExecutionStatusStyle = {
  label: string
  icon: LucideIcon
  /** Icon color */
  text: string
  /** Tinted icon background */
  chip: string
}

// Keyed by the statuses the API reports (see executionStatusSQL in services/http-api)
const executionStatusStyles: Record<string, ExecutionStatusStyle> = {
  Completed: {
    label: 'Completed',
    icon: CircleCheckIcon,
    text: 'text-green-700 dark:text-green-400',
    chip: 'bg-green-100 dark:bg-green-900/60',
  },
  'Fatal Error': {
    label: 'Failed',
    icon: CircleXIcon,
    text: 'text-red-600 dark:text-red-400',
    chip: 'bg-red-100 dark:bg-red-900/50',
  },
  Timeout: {
    label: 'Timed out',
    icon: TimerOffIcon,
    text: 'text-yellow-700 dark:text-yellow-400',
    chip: 'bg-yellow-100 dark:bg-yellow-900/40',
  },
  Cancelled: {
    label: 'Cancelled',
    icon: CircleSlashIcon,
    text: 'text-muted-foreground',
    chip: 'bg-muted',
  },
}

export const executionStatusStyle = (status: string | undefined): ExecutionStatusStyle =>
  executionStatusStyles[status ?? ''] ?? {
    label: status || 'Unknown',
    icon: CircleDashedIcon,
    text: 'text-muted-foreground',
    chip: 'bg-muted',
  }

export const ExecutionStatusIcon: FC<{ status: string | undefined; className?: string }> = ({
  status,
  className,
}) => {
  const { icon: Icon, text, chip, label } = executionStatusStyle(status)
  return (
    <span
      className={cn(
        'flex size-8 shrink-0 items-center justify-center rounded-full',
        chip,
        text,
        className,
      )}
      title={label}
    >
      <Icon className="size-4" />
    </span>
  )
}

/** Human-readable execution duration, e.g. "84 ms", "2.41 s" or "3 m 12 s". */
export const formatDuration = (durationMs: number | undefined) => {
  if (durationMs === undefined || durationMs === null || Number.isNaN(durationMs)) return '—'
  if (durationMs < 1000) return `${durationMs} ms`
  if (durationMs < 60_000) return `${(durationMs / 1000).toFixed(2)} s`
  const minutes = Math.floor(durationMs / 60_000)
  const seconds = Math.round((durationMs % 60_000) / 1000)
  return `${minutes} m ${seconds} s`
}
