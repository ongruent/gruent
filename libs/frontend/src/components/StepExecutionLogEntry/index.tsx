'use client'

import { FC, useState } from 'react'
import dayjs from 'dayjs'
import { ChevronDownIcon } from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../core/collapsible'

type LogAttributes = {
  execution_id: string
  node: string // emitted by the engine runtime logger, not renamed
  level: string
  time: string
  data?: string
  'base64-data'?: string
}

export type StepExecutionLog = {
  traceId: string
  spanId: string
  timestamp: string
  level: string
  body: string
  logAttributes: LogAttributes
  resourceAttributes: Record<string, string>
}

const StepExecutionLogEntry: FC<{
  stepExecutionLog: StepExecutionLog
}> = ({ stepExecutionLog }) => {
  const [open, setOpen] = useState(false)

  const { timestamp, body, level, logAttributes } = stepExecutionLog
  const { node: step } = logAttributes

  const levelStyle = (() => {
    switch (level) {
      case 'error':
        return {
          border: 'border-destructive/40',
          badge: 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300',
        }
      case 'warn':
        return {
          border: 'border-yellow-300 dark:border-yellow-900',
          badge: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
        }
      case 'info':
      default:
        return { border: 'border-border', badge: 'bg-muted text-muted-foreground' }
    }
  })()

  const stringifiedMessage = (() => {
    if (logAttributes.data) {
      const logData = (() => {
        try {
          return JSON.parse(logAttributes.data)
        } catch (_e) {
          // eslint-disable-line
          return logAttributes.data
        }
      })()
      return `${stepExecutionLog.body}\n\n${JSON.stringify(logData, null, 2)}`
    }

    if (logAttributes['base64-data']) {
      const logData = (() => {
        try {
          const d = decodeURIComponent(atob(logAttributes['base64-data']))
          return JSON.parse(d)
        } catch (_e) {
          // eslint-disable-line
          return logAttributes['base64-data']
        }
      })()
      return `${stepExecutionLog.body}\n\n${JSON.stringify(logData, null, 2)}`
    }

    return body
  })()

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className={`mt-2 w-full overflow-hidden rounded-md border bg-card transition-colors ${levelStyle.border}`}
    >
      <CollapsibleTrigger className="flex w-full cursor-pointer items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted/50">
        <span
          className={`w-12 shrink-0 rounded-sm px-1.5 py-0.5 text-center text-[10px] font-semibold tracking-wide uppercase ${levelStyle.badge}`}
        >
          {level}
        </span>
        <span className="min-w-0 grow truncate font-medium select-none">{step}</span>
        <span className="shrink-0 font-mono text-xs text-muted-foreground select-none">
          {dayjs(timestamp).format('HH:mm:ss.SSS')}
        </span>
        <ChevronDownIcon
          size="1em"
          className={`shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="max-w-full overflow-x-auto border-t bg-muted/30">
        <p className="px-3 pt-2 text-xs text-muted-foreground">
          {dayjs(timestamp).format('MM-DD-YYYY HH:mm:ss.SSS')}
        </p>
        <pre className="px-3 pt-1 pb-3 font-mono text-xs whitespace-pre-wrap text-foreground">
          {stringifiedMessage}
        </pre>
      </CollapsibleContent>
    </Collapsible>
  )
}

export default StepExecutionLogEntry
