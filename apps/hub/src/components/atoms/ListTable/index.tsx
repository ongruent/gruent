'use client'

import { Button } from '@gruent/libs/frontend/components/core/button'
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  Table as TableRoot,
  TableRow,
} from '@gruent/libs/frontend/components/core/table'
import { useInterval } from '@react-hooks-library/core'
import { flexRender, Table } from '@tanstack/react-table'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  LoaderCircleIcon,
  RefreshCwIcon,
} from 'lucide-react'
import { FC, PropsWithChildren, useMemo } from 'react'

type TableColumnMeta = {
  align?: 'left' | 'center' | 'right'
}

type Props = {
  table: Table<any>
  page?: number
  totalPages?: number
  autoRefresh?: number // must be greater than or equal to 1000 (1 second)
  isLoading?: boolean
  title?: string
  description?: string
  handlePageChange?: (newPage: number) => void
  headerContent?: React.ReactNode
}

const ListTable: FC<PropsWithChildren<Props>> = ({
  children,
  table,
  page,
  totalPages,
  autoRefresh,
  isLoading,
  title,
  description,
  handlePageChange,
  headerContent,
}) => {
  const startPage = useMemo(() => {
    if (!page) return 1
    return Math.max(1, page - 2)
  }, [page])

  const endPage = useMemo(() => {
    if (!page || !totalPages) return 1
    return Math.min(totalPages, page + 2)
  }, [page, totalPages])

  const pageNumbers = useMemo(() => {
    let pn: number[] = []
    for (let i = startPage; i <= endPage; i++) {
      pn.push(i)
    }

    return pn
  }, [endPage, startPage])

  useInterval(
    () => {
      if (autoRefresh && autoRefresh >= 1e3 && handlePageChange) handlePageChange(page ?? 1)
    },
    autoRefresh ?? 1e3,
    {
      paused: autoRefresh && autoRefresh >= 1e3 ? false : true,
    },
  )

  return (
    <>
      {title && (
        <div className="mb-2">
          <h2 className="text-lg font-extrabold">{title}</h2>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
      )}
      {headerContent && <div className="mb-3">{headerContent}</div>}
      <div className="overflow-hidden rounded-lg border bg-card">
        <TableRoot className="w-full">
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent">
                {headerGroup.headers.map((header) => {
                  const meta = header.column.columnDef.meta as TableColumnMeta | undefined

                  const alignClass = (() => {
                    switch (meta?.align) {
                      case 'center':
                        return 'text-center'
                      case 'right':
                        return 'text-right'
                      default:
                        return 'text-left'
                    }
                  })()

                  return (
                    <TableHead
                      key={header.id}
                      colSpan={header.colSpan}
                      className={`h-auto py-2 px-4 font-normal text-xs text-muted-foreground bg-muted/40 ${alignClass}`}
                      style={{
                        width: header.column.getIndex() === 0 ? 'auto' : header.column.getSize(),
                      }}
                    >
                      {!header.isPlaceholder &&
                        flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow key={row.id} className="group hover:bg-muted/40">
                {row.getVisibleCells().map((cell) => {
                  const meta = cell.column.columnDef.meta as TableColumnMeta | undefined

                  const alignClass = (() => {
                    switch (meta?.align) {
                      case 'center':
                        return 'text-center'
                      case 'right':
                        return 'text-right'
                      default:
                        return 'text-left'
                    }
                  })()

                  return (
                    <TableCell
                      key={cell.id}
                      className={`h-12 p-0 ${alignClass}`}
                      style={{
                        width: cell.column.getIndex() === 0 ? 'auto' : cell.column.getSize(),
                      }}
                    >
                      <div className="h-full w-full flex items-center py-1 px-4 text-foreground">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </div>
                    </TableCell>
                  )
                })}
              </TableRow>
            ))}
            {/* Add empty rows if there are less than 10 rows and page > 1 */}
            {page &&
              page > 1 &&
              table.getRowModel().rows.length < 10 &&
              Array(10 - table.getRowModel().rows.length)
                .fill(0)
                .map((_, index) => (
                  <TableRow key={`empty-${index}`} className="hover:bg-transparent">
                    {table.getHeaderGroups()[0].headers.map((header) => (
                      <TableCell
                        key={`empty-${index}-${header.id}`}
                        className="h-12 p-0"
                        style={{
                          width: header.column.getIndex() === 0 ? 'auto' : header.column.getSize(),
                        }}
                      >
                        <div className="h-full w-full flex items-center py-1 px-4 bg-muted/20">
                          &nbsp;
                        </div>
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
          </TableBody>
        </TableRoot>
        <div className="border-t bg-muted/20 px-4 py-2 [&_small]:text-muted-foreground">
          {children}
        </div>
      </div>
      {page && handlePageChange && (
        <div className="flex gap-2 mt-2">
          {Number(totalPages) > 1 && (
            <div className="flex gap-2">
              <Button
                onClick={() => handlePageChange(1)}
                disabled={page <= 1}
                variant="ghost"
                size="icon-sm"
                aria-label="First page"
              >
                <ChevronsLeftIcon size="1em" />
              </Button>
              <Button
                onClick={() => handlePageChange(page - 1)}
                disabled={page <= 1}
                variant="ghost"
                size="icon-sm"
                aria-label="Previous page"
              >
                <ChevronLeftIcon size="1em" />
              </Button>
              {pageNumbers.map((p) => (
                <Button
                  key={p}
                  onClick={() => handlePageChange(p)}
                  disabled={p === page}
                  variant="ghost"
                  size="icon-sm"
                  className={p === page ? 'text-foreground! font-bold' : ''}
                >
                  {p}
                </Button>
              ))}
              <Button
                onClick={() => handlePageChange(page + 1)}
                disabled={page >= Number(totalPages)}
                variant="ghost"
                size="icon-sm"
                aria-label="Next page"
              >
                <ChevronRightIcon size="1em" />
              </Button>
              <Button
                onClick={() => handlePageChange(Number(totalPages))}
                disabled={page >= Number(totalPages)}
                variant="ghost"
                size="icon-sm"
                aria-label="Last page"
              >
                <ChevronsRightIcon size="1em" />
              </Button>
            </div>
          )}
          <div className="grow" />
          <Button
            onClick={() => handlePageChange(page)}
            variant="ghost"
            size="icon-sm"
            aria-label="Refresh"
            disabled={isLoading}
          >
            {isLoading ? (
              <LoaderCircleIcon size="1em" className="animate-spin" />
            ) : (
              <RefreshCwIcon size="1em" />
            )}
          </Button>
        </div>
      )}
    </>
  )
}

export default ListTable
