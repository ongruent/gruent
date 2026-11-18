'use client'

import { FC, useState } from 'react'
import {
  ColumnDef,
  createColumnHelper,
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { PermissionSet } from '@prisma/client'
import ListTable from '@gruent/hub/components/atoms/ListTable'
import OrgPermissionSetContextMenu from './OrgPermissionSetContextMenu'
import { useRouter } from 'next/navigation'
import SpacePermissionSetContextMenu from './SpacePermissionSetContextMenu'
import { InfoIcon } from 'lucide-react'

type Props = {
  permissionSets: PermissionSet[]
  orgId: string
  spaceId?: string
  page: number
  totalPages: number
  totalResults: number
}

const PermissionSetsTable: FC<Props> = ({
  permissionSets,
  orgId,
  spaceId,
  page,
  totalPages,
  totalResults,
}) => {
  const [rowSelection, setRowSelection] = useState({})

  const router = useRouter()

  const columnHelper = createColumnHelper<PermissionSet>()

  const columns: ColumnDef<PermissionSet>[] = [
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
      cell: (info) => info.getValue(),
      enableSorting: true,
    }),
    columnHelper.display({
      id: 'contextMenu',
      cell: (info) => {
        if (!spaceId)
          return (
            <OrgPermissionSetContextMenu orgId={orgId} permissionSetId={info.row.original.id} />
          )
        else
          return (
            <SpacePermissionSetContextMenu
              orgId={orgId}
              spaceId={spaceId}
              permissionSetId={info.row.original.id}
            />
          )
      },
      size: 25,
      meta: {
        align: 'right',
      },
    }),
  ]

  const table = useReactTable<PermissionSet>({
    data: permissionSets,
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
    newLocation.searchParams.set('permissionsTablePage', newPage.toString())
    router.replace(newLocation.toString(), { scroll: false })
  }

  if (totalResults <= 0)
    return <p>No permission sets found for this {spaceId ? 'space' : 'organization'}</p>

  return (
    <ListTable
      title="Permission Sets"
      description="Ensure team members and API keys have the correct access to resources."
      table={table}
      page={page}
      totalPages={totalPages}
      handlePageChange={handlePageChange}
    >
      {totalResults === 1 ? (
        <small>
          {totalResults} permission set in this {spaceId ? 'space' : 'organization'}
        </small>
      ) : (
        <small>
          {totalResults} permission sets in this {spaceId ? 'space' : 'organization'}
        </small>
      )}
    </ListTable>
  )
}

export default PermissionSetsTable
