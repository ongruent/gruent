'use client'

import useAuth from '@gruent/hub/hooks/useAuth'
import gruentClient from '@gruent/hub/lib/gruent'
import formatRelativeTime from '@gruent/hub/util/formatRelativeTime'
import { Alert, AlertDescription, AlertTitle } from '@gruent/libs/frontend/components/core/alert'
import { Button } from '@gruent/libs/frontend/components/core/button'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@gruent/libs/frontend/components/core/empty'
import { Skeleton } from '@gruent/libs/frontend/components/core/skeleton'
import { ToggleGroup, ToggleGroupItem } from '@gruent/libs/frontend/components/core/toggle-group'
import StepExecutionLogEntry from '@gruent/libs/frontend/components/StepExecutionLogEntry'
import { addToast } from '@gruent/libs/frontend/hooks/useToast'
import copyToClipboard from '@gruent/libs/frontend/util/copyToClipboard'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { cn } from 'cn'
import dayjs from 'dayjs'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleXIcon,
  CopyIcon,
  HistoryIcon,
  LoaderCircleIcon,
  RefreshCwIcon,
  ScrollTextIcon,
} from 'lucide-react'
import { FC, ReactNode, useState } from 'react'
import { ExecutionStatusIcon, executionStatusStyle, formatDuration } from './executionStatus'

const PAGE_SIZE = 10
const REFRESH_INTERVAL_MS = 3e3
const TIMESTAMP_FORMAT = 'MMM D, YYYY HH:mm:ss.SSS'

// Values are the API's status filter: execution statuses, or a log level ("error")
const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
  { value: 'timeout', label: 'Timed out' },
  { value: 'error', label: 'Error logs' },
]

type ChannelStatus = 'PUBLISHED' | 'INITIALIZING' | 'UNPUBLISHED' | undefined

const channelStatusLabel = (status: ChannelStatus) => {
  switch (status) {
    case 'PUBLISHED':
      return { label: 'Published', dot: 'bg-green-500' }
    case 'INITIALIZING':
      return { label: 'Initializing', dot: 'bg-orange-500 animate-pulse' }
    case 'UNPUBLISHED':
      return { label: 'Draft', dot: 'bg-gray-400' }
    default:
      return { label: 'Unknown', dot: 'bg-gray-300 dark:bg-gray-600' }
  }
}

type Props = {
  spaceId: string
  channelId: string
  channelStatus: ChannelStatus
}

/** The editor's execution history: a filterable, auto-refreshing list with an inline detail view. */
const ExecutionHistory: FC<Props> = ({ spaceId, channelId, channelStatus }) => {
  const [executionId, setExecutionId] = useState<string>()

  return executionId ? (
    <ExecutionDetails
      spaceId={spaceId}
      executionId={executionId}
      onBack={() => setExecutionId(undefined)}
    />
  ) : (
    <ExecutionList
      spaceId={spaceId}
      channelId={channelId}
      channelStatus={channelStatus}
      onSelect={setExecutionId}
    />
  )
}

const ExecutionList: FC<Props & { onSelect: (executionId: string) => void }> = ({
  spaceId,
  channelId,
  channelStatus,
  onSelect,
}) => {
  const { accessToken } = useAuth()
  const [page, setPage] = useState(1)
  const [filter, setFilter] = useState('all')
  const status = channelStatusLabel(channelStatus)

  const { data, error, isPending, isFetching, refetch } = useQuery({
    queryKey: ['channelExecutions', spaceId, channelId, page, filter],
    enabled: !!accessToken,
    refetchInterval: REFRESH_INTERVAL_MS,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      if (!accessToken) throw new Error('Invalid auth session.')

      const { data, errors, totalPages, totalResults } = await gruentClient(
        accessToken,
      ).channels.executions.list(spaceId, channelId, {
        page,
        resultsPerPage: PAGE_SIZE,
        statusFilter: filter === 'all' ? undefined : filter,
      })

      if (errors && errors.length > 0) throw new Error(errors[0])
      if (!data) throw new Error('Invalid channel executions.')

      return { executions: data, totalPages: totalPages ?? 1, totalResults: totalResults ?? 0 }
    },
  })

  const executions = data?.executions ?? []
  const totalPages = Math.max(1, data?.totalPages ?? 1)
  const totalResults = data?.totalResults ?? 0
  const firstResult = (page - 1) * PAGE_SIZE + 1
  const lastResult = firstResult + executions.length - 1

  return (
    <div className="flex min-h-full flex-col" data-testid="execution-history">
      <div className="border-b px-6 pt-6 pb-4">
        {/* Leaves room for the sheet's close button */}
        <div className="flex items-center gap-3 pr-8">
          <h2 className="grow text-lg font-semibold">Execution history</h2>
          <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium">
            <span aria-hidden className={cn('size-1.5 rounded-full', status.dot)} />
            {status.label}
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Newest first. Refreshes every {REFRESH_INTERVAL_MS / 1000} seconds.
        </p>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={filter}
          onValueChange={(value) => {
            setFilter(value || 'all')
            setPage(1)
          }}
          aria-label="Filter executions"
          className="mt-4 w-full"
        >
          {FILTERS.map(({ value, label }) => (
            <ToggleGroupItem key={value} value={value} className="grow text-xs">
              {label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <div className="grow px-6 py-4">
        {error && (
          <Alert variant="destructive">
            <CircleXIcon />
            <AlertTitle>Could not get channel executions</AlertTitle>
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        )}

        {!error && isPending && (
          <div className="flex flex-col gap-2" role="status" aria-label="Loading executions">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))}
          </div>
        )}

        {!error && !isPending && executions.length === 0 && (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <HistoryIcon />
              </EmptyMedia>
              <EmptyTitle>
                {filter === 'all' ? 'No executions yet' : 'No matching executions'}
              </EmptyTitle>
              <EmptyDescription>
                {filter === 'all'
                  ? 'Executions appear here once the published channel runs.'
                  : 'No executions of this channel match the selected filter.'}
              </EmptyDescription>
            </EmptyHeader>
            {filter !== 'all' && (
              <Button variant="outline" size="sm" onClick={() => setFilter('all')}>
                Show all executions
              </Button>
            )}
          </Empty>
        )}

        {!error && executions.length > 0 && (
          <ul className="divide-y overflow-hidden rounded-lg border bg-card">
            {executions.map((execution) => {
              const statusStyle = executionStatusStyle(execution.status)
              return (
                <li key={execution.executionId}>
                  <button
                    type="button"
                    onClick={() => onSelect(execution.executionId)}
                    className="group flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
                    data-testid={`execution-${execution.executionId}`}
                  >
                    <ExecutionStatusIcon status={execution.status} />
                    <div className="min-w-0 grow">
                      <p className="flex items-baseline gap-2 text-sm">
                        <span className="font-medium">{statusStyle.label}</span>
                        <span
                          className="text-muted-foreground"
                          title={dayjs(execution.startTime).format(TIMESTAMP_FORMAT)}
                        >
                          {formatRelativeTime(execution.startTime) ??
                            dayjs(execution.startTime).format(TIMESTAMP_FORMAT)}
                        </span>
                      </p>
                      <p className="truncate font-mono text-xs text-muted-foreground">
                        {execution.executionId}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatDuration(execution.durationMs)}
                    </span>
                    <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div className="sticky bottom-0 flex items-center gap-2 border-t bg-background px-6 py-3">
        <p className="grow text-xs text-muted-foreground tabular-nums">
          {totalResults > 0
            ? `${firstResult}–${lastResult} of ${totalResults.toLocaleString('en-US')}`
            : 'No executions'}
        </p>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Refresh"
          title="Refresh"
          disabled={isFetching}
          onClick={() => refetch()}
        >
          {isFetching ? <LoaderCircleIcon className="animate-spin" /> : <RefreshCwIcon />}
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Previous page"
          disabled={page <= 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
        >
          <ChevronLeftIcon />
        </Button>
        <span className="text-xs text-muted-foreground tabular-nums">
          {page} / {totalPages}
        </span>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Next page"
          disabled={page >= totalPages}
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
        >
          <ChevronRightIcon />
        </Button>
      </div>
    </div>
  )
}

const Detail: FC<{ label: string; children: ReactNode }> = ({ label, children }) => (
  <div className="min-w-0">
    <dt className="text-xs text-muted-foreground">{label}</dt>
    <dd className="truncate text-sm">{children}</dd>
  </div>
)

const ExecutionDetails: FC<{ spaceId: string; executionId: string; onBack: () => void }> = ({
  spaceId,
  executionId,
  onBack,
}) => {
  const { accessToken } = useAuth()

  const {
    data: execution,
    error,
    isPending,
  } = useQuery({
    queryKey: ['channelExecution', spaceId, executionId],
    enabled: !!accessToken,
    queryFn: async () => {
      if (!accessToken) throw new Error('Invalid auth session.')

      const { data, errors } = await gruentClient(accessToken).channels.executions.get(
        spaceId,
        executionId,
      )

      if (errors && errors.length > 0) throw new Error(errors[0])
      if (!data) throw new Error('Invalid execution.')

      return data
    },
  })

  const handleCopyId = async () => {
    const { error } = await copyToClipboard(executionId)
    addToast(
      error
        ? {
            title: 'Could not copy to clipboard',
            body: 'This may be due to browser permissions. Please allow copying to clipboard and try again.',
            level: 'error',
          }
        : { title: 'Copied execution ID', body: executionId, level: 'success' },
    )
  }

  const statusStyle = executionStatusStyle(execution?.status)
  const logs = execution?.stepExecutionLogs ?? []

  return (
    <div className="flex flex-col" data-testid="execution-details">
      <div className="border-b px-6 pt-5 pb-4">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2.5 text-muted-foreground"
          onClick={onBack}
        >
          <ChevronLeftIcon /> All executions
        </Button>
        <div className="mt-3 flex items-center gap-3">
          <ExecutionStatusIcon status={execution?.status} className="size-10" />
          <div className="min-w-0 grow">
            <h2 className="text-lg leading-6 font-semibold">
              {isPending ? 'Loading execution…' : statusStyle.label}
            </h2>
            <div className="flex items-center gap-1">
              <p className="truncate font-mono text-xs text-muted-foreground">{executionId}</p>
              <Button
                variant="ghost"
                size="icon-sm"
                className="size-6 text-muted-foreground"
                aria-label="Copy execution ID"
                title="Copy execution ID"
                onClick={handleCopyId}
              >
                <CopyIcon className="size-3.5" />
              </Button>
            </div>
          </div>
        </div>
        {execution && (
          <dl className="mt-4 grid grid-cols-3 gap-4 rounded-lg border bg-muted/30 px-4 py-3">
            <Detail label="Started">
              <span title={dayjs(execution.startTime).format(TIMESTAMP_FORMAT)}>
                {dayjs(execution.startTime).format('MMM D, HH:mm:ss')}
              </span>
            </Detail>
            <Detail label="Ended">
              <span title={dayjs(execution.endTime).format(TIMESTAMP_FORMAT)}>
                {dayjs(execution.endTime).format('MMM D, HH:mm:ss')}
              </span>
            </Detail>
            <Detail label="Duration">{formatDuration(execution.durationMs)}</Detail>
          </dl>
        )}
      </div>

      <div className="px-6 py-4">
        {error && (
          <Alert variant="destructive">
            <CircleXIcon />
            <AlertTitle>Could not get the selected channel execution</AlertTitle>
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        )}
        {!error && isPending && (
          <div className="flex flex-col gap-2" role="status" aria-label="Loading logs">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-11 w-full rounded-md" />
            ))}
          </div>
        )}
        {execution && (
          <>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
              Logs
              <span className="text-xs font-normal text-muted-foreground tabular-nums">
                {logs.length}
              </span>
            </h3>
            {logs.length === 0 ? (
              <Empty className="border py-8 md:py-8">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <ScrollTextIcon />
                  </EmptyMedia>
                  <EmptyTitle>No logs</EmptyTitle>
                  <EmptyDescription>
                    This execution did not record any log entries.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <div className="-mt-2">
                {logs.map((log, index) => (
                  <StepExecutionLogEntry
                    key={`${log.logAttributes.node}-${log.level}-${log.timestamp}-${index}`}
                    stepExecutionLog={log}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default ExecutionHistory
