'use client'

import { FC, useState } from 'react'
import {
  ColumnDef,
  createColumnHelper,
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { OrganizationMember, PermissionSet, User } from '@prisma/client'
import ListTable from '@gruent/hub/components/atoms/ListTable'
import { useRouter } from 'next/navigation'
import MemberContextMenu from './MembersContextMenu'
import { MailIcon, UserCogIcon, UserLockIcon } from 'lucide-react'

type Member = OrganizationMember & {
  user: User
}

type Props = {
  users: Member[]
  permissionSets: PermissionSet[]
  orgId: string
  page: number
  totalPages: number
  totalResults: number
}

const MembersTable: FC<Props> = ({
  orgId,
  users,
  permissionSets,
  page,
  totalPages,
  totalResults,
}) => {
  const [rowSelection, setRowSelection] = useState({})

  const router = useRouter()

  const columnHelper = createColumnHelper<Member>()

  const columns: ColumnDef<Member>[] = [
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
    columnHelper.accessor('user.email', {
      header: () => (
        <div className="flex items-center">
          <MailIcon size="1em" className="mr-1" />
          <span>Email</span>
        </div>
      ),
      cell: (info) => info.getValue(),
      enableSorting: true,
    }),
    columnHelper.accessor('role', {
      header: () => (
        <div className="flex items-center">
          <UserLockIcon size="1em" className="mr-1" />
          <span>Role</span>
        </div>
      ),
      cell: (info) => info.getValue(),
      enableSorting: true,
      size: 150,
    }),
    columnHelper.accessor('organizationPermissionSetId', {
      header: () => (
        <div className="flex items-center">
          <UserCogIcon size="1em" className="mr-1" />
          <span>Permission Set</span>
        </div>
      ),
      cell: (info) => {
        if (info.row.original.role === 'ADMIN') return 'Admin'
        const permissionSet = permissionSets.find((ps) => {
          return ps.id === info.getValue()
        })

        if (!permissionSet) return info.getValue()

        return permissionSet.name
      },
      enableSorting: true,
      size: 200,
    }),
    columnHelper.display({
      id: 'contextMenu',
      cell: (info) => (
        <MemberContextMenu
          orgId={orgId}
          userId={info.row.original.userId}
          admin={info.row.original.role === 'ADMIN'}
          initialPermissionSetId={info.row.original.organizationPermissionSetId}
          permissionSets={permissionSets}
        />
      ),
      size: 25,
      meta: {
        align: 'right',
      },
    }),
  ]

  const table = useReactTable<Member>({
    data: users,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getRowId: (original) => original.userId,
    enableRowSelection: true,
    manualPagination: true,
    state: {
      rowSelection,
    },
    onRowSelectionChange: setRowSelection,
  })

  const handlePageChange = (newPage: number) => {
    const newLocation = new URL(window.location.toString())
    newLocation.searchParams.set('membersTablePage', newPage.toString())
    router.replace(newLocation.toString(), { scroll: false })
  }

  return (
    <ListTable
      title="Members"
      description="Invite your team to collaborate on projects."
      table={table}
      page={page}
      totalPages={totalPages}
      handlePageChange={handlePageChange}
    >
      {totalResults === 1 ? (
        <small>{totalResults} member in this organization</small>
      ) : (
        <small>{totalResults} members in this organization</small>
      )}
    </ListTable>
  )
}

export default MembersTable
