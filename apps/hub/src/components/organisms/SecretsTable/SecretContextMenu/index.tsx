'use client'

import { FC, useState } from 'react'
import { addToast } from '@gruent/libs/frontend/hooks/useToast'
import { Button } from '@gruent/libs/frontend/components/core/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@gruent/libs/frontend/components/core/dropdown-menu'
import { handleDeleteSecret } from '@gruent/hub/actions/secrets'
import { openModal } from '@gruent/libs/frontend/hooks/useModal'
import EditSecretModal from '@gruent/hub/components/modals/EditSecretModal'
import { EllipsisVerticalIcon, PencilIcon, Trash2Icon } from 'lucide-react'

type Props = {
  secretName: string
  spaceId: string
  className?: string
}

const SecretContextMenu: FC<Props> = ({ secretName, spaceId }) => {
  const [showModal, setShowModal] = useState<boolean>(false)

  const handleEditPermissions = () => {
    openModal('editSecret')
    setShowModal(true)
  }

  const handleDelete = async () => {
    const { error } = await handleDeleteSecret(spaceId, secretName)
    if (error) {
      addToast({
        title: 'Could not delete the secret',
        body: `The secret that you selected could not be deleted: ${error}`,
        level: 'error',
      })
    } else {
      addToast({
        title: 'Successfully deleted secret',
        body: 'Successfully deleted secret from your space.',
        level: 'success',
      })
    }
  }

  return (
    <>
      <EditSecretModal
        spaceId={spaceId}
        name={secretName}
        showModal={showModal}
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
            <DropdownMenuItem onSelect={handleEditPermissions}>
              <PencilIcon /> Edit
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onSelect={handleDelete}>
              <Trash2Icon /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  )
}

export default SecretContextMenu
