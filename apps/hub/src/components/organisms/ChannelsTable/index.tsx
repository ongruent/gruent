'use client'

import ListTable from '@gruent/hub/components/atoms/ListTable'
import RelativeTime from '@gruent/hub/components/atoms/RelativeTime'
import ChannelContextMenu from '@gruent/hub/components/organisms/ChannelsTable/ChannelContextMenu'
import apiField from '@gruent/hub/util/apiField'
import { Button } from '@gruent/libs/frontend/components/core/button'
import { openModal } from '@gruent/libs/frontend/hooks/useModal'
import { AppliedTag, Channel, Tag } from '@prisma/client'
import { useClickOutside } from '@react-hooks-library/core'
import {
  ColumnDef,
  createColumnHelper,
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
} from '@tanstack/react-table'
import {
  CirclePlusIcon,
  ClockIcon,
  CloudIcon,
  InfoIcon,
  LibraryIcon,
  PlusIcon,
  SlidersHorizontalIcon,
  SquarePenIcon,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FC, useCallback, useRef, useState } from 'react'
import TagMenu from '../../modals/TagMenu'
import SearchBar from '../../molecules/SearchBar'

type Props = {
  channels: (Channel & { tags?: (AppliedTag & { tag: Tag })[] })[]
  tags: Tag[]
  orgId: string
  spaceId: string
  page: number
  totalPages: number
  totalResults: number
  searchFilter?: string
  tagFilter?: string[]
}

const ChannelsTable: FC<Props> = ({
  channels,
  tags,
  orgId,
  spaceId,
  page,
  totalPages,
  totalResults,
  searchFilter,
  tagFilter,
}) => {
  const [rowSelection, setRowSelection] = useState({})
  const [tagCreateSubject, setTagCreateSubject] = useState<Channel>()
  const [showFilterOptions, setShowFilterOptions] = useState(false)
  const router = useRouter()
  const filterOptionsRef = useRef<HTMLDivElement>(null)

  useClickOutside(filterOptionsRef, () => setShowFilterOptions(false))

  const columnHelper = createColumnHelper<Channel & { tags?: (AppliedTag & { tag: Tag })[] }>()

  const columns: ColumnDef<Channel & { tags?: (AppliedTag & { tag: Tag })[] }>[] = [
    // TODO: enable selection when there is bulk action support in the UI for selected rows
    // {
    //   id: 'select',
    //   cell: ({ row }) => (
    //     <Checkbox
    //       aria-label="Select row"
    //       checked={row.getIsSelected()}
    //       disabled={!row.getCanSelect()}
    //       onCheckedChange={(checked) => row.toggleSelected(checked === true)}
    //     />
    //   ),
    // },
    columnHelper.accessor('name', {
      header: () => (
        <div className="flex items-center">
          <InfoIcon size="1em" className="mr-1" />
          <span>Name</span>
        </div>
      ),
      cell: (info) => (
        <Link
          className="font-medium hover:underline"
          href={`/organizations/${orgId}/spaces/${spaceId}/channels/${info.row.id}`}
        >
          {info.getValue()}
        </Link>
      ),
      size: 200,
      enableSorting: true,
    }),
    columnHelper.display({
      id: 'published',
      header: () => (
        <div className="flex items-center">
          <CloudIcon size="1em" className="mr-1" />
          <span>Published</span>
        </div>
      ),
      cell: (info) => {
        const publishedAt = apiField<string | null>(info.row.original, 'publishedAt')
        return (
          <span
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground"
            title={publishedAt ? new Date(publishedAt).toLocaleString() : undefined}
          >
            <span
              aria-hidden
              className={`size-2 rounded-full ${publishedAt ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`}
            />
            {publishedAt ? 'Published' : 'Draft'}
          </span>
        )
      },
      size: 140,
    }),
    columnHelper.display({
      id: 'updated',
      header: () => (
        <div className="flex items-center">
          <ClockIcon size="1em" className="mr-1" />
          <span>Updated</span>
        </div>
      ),
      cell: (info) => <RelativeTime value={apiField<string>(info.row.original, 'updatedAt')} />,
      size: 140,
    }),
    columnHelper.accessor('tags', {
      header: () => (
        <div className="flex items-center">
          <LibraryIcon size="1em" className="mr-1" />
          <span>Tags</span>
        </div>
      ),
      cell: (info) => {
        const value = info.getValue()
        if (value && value.length > 0) {
          return (
            <div className="relative flex flex-wrap gap-2">
              {value.map((appliedTag, index) => {
                if (index > 3) return null
                if (index > 2)
                  return (
                    <span
                      key="__ellipsis__"
                      className="px-3 transition bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200 rounded-full text-sm"
                    >
                      ...
                    </span>
                  )
                return (
                  <Link
                    href={`/organizations/${orgId}/spaces/${spaceId}/tags/${appliedTag.tagId}`}
                    key={appliedTag.id}
                  >
                    <span className="px-2 py-1 transition bg-gray-100 hover:bg-gray-200 text-gray-800 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-200 rounded-full text-sm">
                      {appliedTag.tag.name}
                    </span>
                  </Link>
                )
              })}
              {tagCreateSubject === info.row.original && (
                <TagMenu
                  spaceId={spaceId}
                  subject={info.row.original}
                  setSubject={setTagCreateSubject}
                  tags={tags}
                />
              )}
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Add tag"
                onClick={() => setTagCreateSubject(info.row.original)}
              >
                <PlusIcon />
              </Button>
            </div>
          )
        }
        return (
          <div className="relative">
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Add tag"
              onClick={() => setTagCreateSubject(info.row.original)}
            >
              <PlusIcon />
            </Button>
            {tagCreateSubject === info.row.original && (
              <TagMenu
                spaceId={spaceId}
                subject={info.row.original}
                setSubject={setTagCreateSubject}
                tags={tags}
              />
            )}
          </div>
        )
      },
    }),
    columnHelper.display({
      id: 'contextMenu',
      cell: (info) => (
        <div className="flex items-center justify-end gap-1 w-full">
          <Button variant="ghost" size="icon-sm" aria-label="Edit channel" title="Edit" asChild>
            <Link href={`/organizations/${orgId}/spaces/${spaceId}/channels/${info.row.id}/edit`}>
              <SquarePenIcon />
            </Link>
          </Button>
          <ChannelContextMenu spaceId={spaceId} channel={info.row.original} />
        </div>
      ),
      size: 90,
      meta: {
        align: 'right',
      },
    }),
  ]

  const handleTagFilterChange = useCallback(
    (tagId: string) => {
      const updatedTagFilter = (() => {
        if (!tagFilter) return [tagId]

        if (tagFilter.includes(tagId)) return tagFilter.filter((t) => t !== tagId)
        return [...tagFilter, tagId]
      })()

      const newLocation = new URL(window.location.toString())
      if (updatedTagFilter.length > 0) {
        newLocation.searchParams.set('tagFilter', updatedTagFilter.join(','))
      } else {
        newLocation.searchParams.delete('tagFilter')
      }
      router.replace(newLocation.toString(), { scroll: false })
    },
    [router, tagFilter],
  )

  const clearFilters = useCallback(() => {
    // Clear tag filter
    const newLocation = new URL(window.location.toString())
    newLocation.searchParams.delete('tagFilter')
    router.replace(newLocation.toString(), { scroll: false })
  }, [router])

  const table = useReactTable<Channel & { tags?: (AppliedTag & { tag: Tag })[] }>({
    data: channels ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getRowId: (original) => original.id,
    enableRowSelection: true,
    manualPagination: true,
    state: {
      rowSelection,
    },
    onRowSelectionChange: setRowSelection,
  })

  const handlePageChange = (newPage: number) => {
    const newLocation = new URL(window.location.toString())
    newLocation.searchParams.set('page', newPage.toString())
    router.replace(newLocation.toString(), { scroll: false })
  }

  return (
    <>
      <ListTable
        table={table}
        page={page}
        totalPages={totalPages}
        handlePageChange={handlePageChange}
        headerContent={
          <>
            <div className="flex flex-wrap items-end gap-2 mb-1 relative">
              <SearchBar paramKey="q" initialFilter={searchFilter} placeholder="Search channels" />
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
              <Button variant="outline" onClick={() => openModal('createChannel')}>
                <CirclePlusIcon />
                <span>Create</span>
              </Button>
              {showFilterOptions && (
                <div
                  ref={filterOptionsRef}
                  className="absolute max-w-[500px] z-10 top-10 right-0 bg-popover text-popover-foreground border rounded-md shadow-md p-4 flex flex-col gap-2 overflow-hidden"
                >
                  <div className="border-b pb-2">
                    <h2 className="text-sm font-medium mb-1">Tags</h2>
                    <div className="flex flex-wrap items-center gap-2">
                      {tags.map((tag) => {
                        if (tagFilter && tagFilter.includes(tag.id))
                          return (
                            <Button
                              key={tag.id}
                              size="sm"
                              aria-pressed
                              onClick={() => handleTagFilterChange(tag.id)}
                            >
                              {tag.name}
                            </Button>
                          )

                        return (
                          <Button
                            key={tag.id}
                            variant="outline"
                            size="sm"
                            aria-pressed={false}
                            onClick={() => handleTagFilterChange(tag.id)}
                          >
                            {tag.name}
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
          <small>{totalResults} channel in this space</small>
        ) : (
          <small>{totalResults} channels in this space</small>
        )}
      </ListTable>
    </>
  )
}

export default ChannelsTable
