'use client'

import { FC, useCallback, useState } from 'react'
import { addToast } from '@gruent/libs/frontend/hooks/useToast'
import { openModal } from '@gruent/libs/frontend/hooks/useModal'
import { PermissionSet } from '@prisma/client'
import { Button } from '@gruent/libs/frontend/components/core/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@gruent/libs/frontend/components/core/dropdown-menu'
import { handleChangeMemberRole, handleRemoveMember } from '@gruent/hub/actions/members'
import EditUserPermissionsModal from '@gruent/hub/components/modals/EditUserPermissionsModal'
import { EllipsisVerticalIcon, PencilLineIcon, Trash2Icon, UserLockIcon } from 'lucide-react'

type Props = {
  userId: string
  orgId: string
  admin: boolean
  initialPermissionSetId: string
  permissionSets: PermissionSet[]
  className?: string
}

const MemberContextMenu: FC<Props> = ({
  userId,
  orgId,
  admin = false,
  initialPermissionSetId,
  permissionSets,
}) => {
  const [showModal, setShowModal] = useState<boolean>(false)

  const handleEditPermissions = () => {
    openModal('editUserPermissionSet')
    setShowModal(true)
  }

  const handleChangeRole = useCallback(
    async (newRole: 'ADMIN' | 'MEMBER') => {
      const { error } = await handleChangeMemberRole(orgId, userId, newRole)
      if (error) {
        addToast({
          title: 'Could not change the member role',
          body: `The member role could not be changed: ${error}`,
          level: 'error',
        })
      } else {
        addToast({
          title: 'Successfully changed the member role',
          body: `The user is now a ${newRole === 'ADMIN' ? 'admin' : 'member'} in this organization. This change should be reflected immediately.`,
          level: 'success',
        })
      }
    },
    [orgId, userId],
  )

  const handleRemove = async () => {
    const { error } = await handleRemoveMember(orgId, userId)
    if (error) {
      addToast({
        title: 'Could not remove the team member',
        body: `The team member that you selected could not be removed: ${error}`,
        level: 'error',
      })
    } else {
      addToast({
        title: 'Successfully removed team member',
        body: 'Successfully removed the team member from your organization.',
        level: 'success',
      })
    }
  }

  return (
    <>
      <EditUserPermissionsModal
        orgId={orgId}
        userId={userId}
        showModal={showModal}
        initialPermissionSetId={initialPermissionSetId}
        permissionSets={permissionSets}
        onClose={() => setShowModal(false)}
      />
      <div className="flex justify-end">
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Open actions menu">
              <EllipsisVerticalIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-44">
            {admin ? (
              <DropdownMenuItem onSelect={() => handleChangeRole('MEMBER')}>
                <UserLockIcon />
                <div className="flex flex-col">
                  <span>Change role</span>
                  <span className="text-xs text-muted-foreground">Change role to member</span>
                </div>
              </DropdownMenuItem>
            ) : (
              <>
                <DropdownMenuItem onSelect={() => handleChangeRole('ADMIN')}>
                  <UserLockIcon />
                  <div className="flex flex-col">
                    <span>Change role</span>
                    <span className="text-xs text-muted-foreground">Change role to admin</span>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={handleEditPermissions}>
                  <PencilLineIcon /> Edit
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onSelect={handleRemove}>
                  <Trash2Icon />
                  <div className="flex flex-col">
                    <span>Remove</span>
                    <span className="text-xs text-muted-foreground">
                      Revoke this member&apos;s access to this organization.
                    </span>
                  </div>
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  )
}

export default MemberContextMenu
