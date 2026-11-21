'use client'

import ListTable from '@gruent/hub/components/atoms/ListTable'
import { Button } from '@gruent/libs/frontend/components/core/button'
import { useClickOutside } from '@react-hooks-library/core'
import {
  ColumnDef,
  createColumnHelper,
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
} from '@tanstack/react-table'
import dayjs from 'dayjs'
import { SettingsIcon, SlidersHorizontalIcon } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FC, useRef, useState } from 'react'
import ListTablePlaceholder from '../../molecules/ListTablePlaceholder'

type ChannelExecutionListItem = {
  executionId: string
  status: string
  startTime: string
  endTime: string
  durationMs: number
  channelId: string
  logAttributes: Record<string, string>
}

type Props = {
  channelExecutionList: ChannelExecutionListItem[]
  orgId: string
  spaceId: string
  page: number
  totalPages: number
  totalResults: number
  autoRefresh?: number
  isLoading?: boolean
  onPageChange?: (newPage: number) => void
  onExecutionClick?: (executionId: string) => void
  statusFilter?: string
  onStatusFilterChange?: (status: string | null) => void
}

const ChannelExecutionsTable: FC<Props> = ({
  orgId,
  spaceId,
  channelExecutionList,
  page,
  totalPages,
  totalResults,
  autoRefresh,
  isLoading,
  onPageChange,
  onExecutionClick,
  statusFilter,
  onStatusFilterChange,
}) => {
  const [rowSelection, setRowSelection] = useState({})
  const [showFilterOptions, setShowFilterOptions] = useState(false)
  const router = useRouter()
  const filterOptionsRef = useRef<HTMLDivElement>(null)

  useClickOutside(filterOptionsRef, () => setShowFilterOptions(false))

  const columnHelper = createColumnHelper<ChannelExecutionListItem>()

  const columns: ColumnDef<ChannelExecutionListItem>[] = [
    columnHelper.accessor('executionId', {
      header: () => 'Execution ID',
      cell: (info) => {
        if (onExecutionClick) {
          return (
            <span
              className="cursor-pointer"
              onClick={() => {
                onExecutionClick?.(info.getValue())
              }}
            >
              {info.getValue()}
            </span>
          )
        }

        return (
          <Link
            href={`/organizations/${orgId}/spaces/${spaceId}/channels/${info.row.original.channelId}/executions/${info.row.id}`}
          >
            {info.getValue()}
          </Link>
        )
      },
      enableSorting: true,
    }),
    columnHelper.accessor('status', {
      header: () => 'Status',
      cell: (info) => {
        const status = info.getValue()
        const dot =
          {
            Completed: 'bg-green-500',
            'Fatal Error': 'bg-red-500',
            Timeout: 'bg-yellow-500',
          }[status] ?? 'bg-gray-300 dark:bg-gray-600'
        return (
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className={`size-2 rounded-full ${dot}`} />
            {status}
          </span>
        )
      },
      enableSorting: true,
    }),
    columnHelper.accessor('startTime', {
      header: () => 'Started At',
      cell: (info) => dayjs(info.getValue()).format('MM/DD/YYYY HH:mm:ss.SSS'),
      enableSorting: true,
    }),
    columnHelper.display({
      id: 'duration',
      header: () => 'Duration',
      cell: (info) => {
        const { durationMs } = info.row.original

        const durationString = (() => {
          if (durationMs < 500) return `${durationMs}ms`
          return `${durationMs / 1000}s`
        })()

        return durationString
      },
      enableSorting: true,
    }),
  ]

  const table = useReactTable<ChannelExecutionListItem>({
    data: channelExecutionList,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getRowId: (original) => original.executionId,
    enableRowSelection: true,
    manualPagination: true,
    state: {
      rowSelection,
    },
    onRowSelectionChange: setRowSelection,
  })

  const handlePageChange = (newPage: number) => {
    if (onPageChange) {
      onPageChange(newPage)
      return
    }

    const newLocation = new URL(window.location.toString())
    newLocation.searchParams.set('page', newPage.toString())
    router.replace(newLocation.toString(), { scroll: false })
  }

  const handleStatusFilterChange = (status: string) => {
    if (onStatusFilterChange) {
      onStatusFilterChange(status)
      return
    }

    const newLocation = new URL(window.location.toString())
    newLocation.searchParams.set('statusFilter', status)
    router.replace(newLocation.toString(), { scroll: false })
  }

  const clearFilters = () => {
    if (onStatusFilterChange) {
      onStatusFilterChange(null)
      return
    }

    const newLocation = new URL(window.location.toString())
    newLocation.searchParams.delete('statusFilter')
    router.replace(newLocation.toString(), { scroll: false })
  }

  return (
    <>
      {((Number(totalResults) > 0 && !statusFilter) || statusFilter) && (
        <ListTable
          title="Channel Execution Logs"
          table={table}
          page={page}
          totalPages={totalPages}
          handlePageChange={handlePageChange}
          autoRefresh={autoRefresh}
          isLoading={isLoading}
          headerContent={
            <>
              <div className="flex flex-wrap items-end gap-2 mb-1 relative">
                <div className="grow" />
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Filter options"
                  aria-expanded={showFilterOptions}
                  onClick={() => setShowFilterOptions((current) => !current)}
                >
                  <SlidersHorizontalIcon />
                </Button>
                {showFilterOptions && (
                  <div
                    ref={filterOptionsRef}
                    className="absolute max-w-[500px] z-10 top-10 right-0 bg-popover text-popover-foreground border rounded-md shadow-md p-4 flex flex-col gap-2 overflow-hidden"
                  >
                    <div className="border-b pb-2">
                      <h2 className="text-sm font-medium mb-1">Tags</h2>
                      <div className="flex flex-wrap items-center gap-2">
                        {['info', 'error'].map((status) => {
                          if (statusFilter && statusFilter.includes(status))
                            return (
                              <Button
                                key={status}
                                size="sm"
                                aria-pressed
                                onClick={() => handleStatusFilterChange(status)}
                              >
                                {status}
                              </Button>
                            )

                          return (
                            <Button
                              key={status}
                              variant="outline"
                              size="sm"
                              aria-pressed={false}
                              onClick={() => handleStatusFilterChange(status)}
                            >
                              {status}
                            </Button>
                          )
                        })}
                      </div>
                    </div>
                    <span
                      className="cursor-pointer transition text-xs text-muted-foreground hover:text-red-500"
                      onClick={clearFilters}
                    >
                      Clear filters
                    </span>
                  </div>
                )}
              </div>
            </>
          }
        >
          {totalResults === 1 ? (
            <small>{totalResults} execution of this channel</small>
          ) : (
            <small>{totalResults} executions of this channel</small>
          )}
        </ListTable>
      )}
      {Number(totalResults) <= 0 && !statusFilter && (
        <ListTablePlaceholder
          title="Channel Executions"
          description="No executions found for this channel"
        >
          <SettingsIcon size="3em" />
          <p className="text-gray-500 px-4">No executions found for this channel... yet!</p>
        </ListTablePlaceholder>
      )}
    </>
  )
}

export default ChannelExecutionsTable
