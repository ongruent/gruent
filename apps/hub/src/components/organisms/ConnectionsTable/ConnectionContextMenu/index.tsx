'use client'

import { FC } from 'react'
import { addToast } from '@gruent/libs/frontend/hooks/useToast'
import { Button } from '@gruent/libs/frontend/components/core/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@gruent/libs/frontend/components/core/dropdown-menu'
import { handleDeleteConnection } from '@gruent/hub/actions/connections'
import { EllipsisVerticalIcon, Trash2Icon } from 'lucide-react'
type Props = {
  connectionId: string
  spaceId: string
  className?: string
}

const ConnectionContextMenu: FC<Props> = ({ connectionId, spaceId }) => {
  const handleDelete = async () => {
    const { error } = await handleDeleteConnection(spaceId, connectionId)
    if (error) {
      addToast({
        title: 'Could not delete the connection',
        body: `The connection that you selected could not be deleted: ${error}`,
        level: 'error',
      })
    } else {
      addToast({
        title: 'Successfully deleted connection',
        body: 'Successfully deleted connection from your space.',
        level: 'success',
      })
    }
  }

  return (
    <div className="flex justify-end">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="Open actions menu">
            <EllipsisVerticalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-44">
          <DropdownMenuItem variant="destructive" onSelect={handleDelete}>
            <Trash2Icon /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

export default ConnectionContextMenu
