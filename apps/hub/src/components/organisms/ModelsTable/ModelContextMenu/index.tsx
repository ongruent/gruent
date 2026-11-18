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
import { handleDeleteModel } from '@gruent/hub/actions/models'
import { EllipsisVerticalIcon, Trash2Icon } from 'lucide-react'

type Props = {
  modelId: string
  spaceId: string
  className?: string
}

const ModelContextMenu: FC<Props> = ({ modelId, spaceId }) => {
  const handleDelete = async () => {
    const { error } = await handleDeleteModel(spaceId, modelId)
    if (error) {
      addToast({
        title: 'Could not delete the model',
        body: `The model that you selected could not be deleted: ${error}`,
        level: 'error',
      })
    } else {
      addToast({
        title: 'Successfully deleted model',
        body: 'Successfully deleted model from your space.',
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

export default ModelContextMenu
