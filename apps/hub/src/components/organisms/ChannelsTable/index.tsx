'use client'

import { FC, useCallback, useRef, useState } from 'react'
import {
  ColumnDef,
  createColumnHelper,
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { AppliedTag, Channel, Tag } from '@prisma/client'
import ChannelContextMenu from '@gruent/hub/components/organisms/ChannelsTable/ChannelContextMenu'
import ListTable from '@gruent/hub/components/atoms/ListTable'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  CirclePlusIcon,
  CloudIcon,
  InfoIcon,
  LibraryIcon,
  PlusIcon,
  SlidersHorizontalIcon,
} from 'lucide-react'
import TagMenu from '../../modals/TagMenu'
import { Button } from '@gruent/libs/frontend/components/core/button'
import { openModal } from '@gruent/libs/frontend/hooks/useModal'
import { useClickOutside } from '@react-hooks-library/core'
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
        <Link href={`/organizations/${orgId}/spaces/${spaceId}/channels/${info.row.id}/edit`}>
          {info.getValue()}
        </Link>
      ),
      size: 200,
      enableSorting: true,
    }),
    columnHelper.accessor('publishedAt', {
      header: () => (
        <div className="flex items-center">
          <CloudIcon size="1em" className="mr-1" />
          <span>Published</span>
        </div>
      ),
      cell: (info) => {
        const publishedAt = info.getValue()
        if (publishedAt) {
          return (
            <div className="flex flex-col items-center w-full">
              <div style={{ width: 8, height: 8 }} className="rounded-full bg-green-500" />
            </div>
          )
        }
        return (
          <div className="flex flex-col items-center w-full">
            <div style={{ width: 8, height: 8 }} className="rounded-full bg-gray-300" />
          </div>
        )
      },
      size: 125,
      enableSorting: true,
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
        <div className="flex items-center justify-center w-full">
          {/* <Link
            className="hover:text-green-700 mr-2"
            href={`/organizations/${orgId}/spaces/${spaceId}/channels/${info.row.id}/edit`}
          >
            <SquarePenIcon size="1.3333em" />
          </Link> */}
          <ChannelContextMenu spaceId={spaceId} channel={info.row.original} />
        </div>
      ),
      size: 25,
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
        title="Channels"
        description="Build connections to power your ideas."
        table={table}
        page={page}
        totalPages={totalPages}
        handlePageChange={handlePageChange}
        headerContent={
          <>
            <div className="flex flex-wrap items-end gap-2 mb-1 relative">
              <SearchBar paramKey="q" initialFilter={searchFilter} placeholder="Search things" />
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
                  className="absolute max-w-[500px] z-10 top-10 right-0 bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-md p-4 flex flex-col gap-2 overflow-hidden"
                >
                  <div className="border-b border-gray-200 dark:border-gray-800 pb-2">
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
                    className="cursor-pointer transition text-xs text-gray-600 hover:text-red-500"
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
