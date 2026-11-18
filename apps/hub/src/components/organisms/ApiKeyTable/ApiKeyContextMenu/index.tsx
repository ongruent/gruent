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
import { handleDeleteApiKey } from '@gruent/hub/actions/apiKeys'
import { ClipboardIcon, EllipsisVerticalIcon, Trash2Icon } from 'lucide-react'
import copyToClipboard from '@gruent/libs/frontend/util/copyToClipboard'

type Props = {
  apiKeyId: string
  orgId: string
  spaceId?: string
  className?: string
}

const ApiKeyContextMenu: FC<Props> = ({ apiKeyId, orgId, spaceId }) => {
  const handleCopy = async () => {
    const { error } = await copyToClipboard(apiKeyId)
    if (error)
      addToast({
        title: 'Could not copy text',
        body: 'Could not copy the API key to your clipboard. This may be due to a browser permission issue.',
      })
    else
      addToast({
        title: 'Copied text',
        body: 'The API key should now be in your clipboard!',
      })
  }

  const handleDelete = async () => {
    const { error } = await handleDeleteApiKey(orgId, apiKeyId, spaceId)
    if (error) {
      addToast({
        title: 'Could not delete the API key',
        body: `The API key that you selected could not be deleted: ${error}`,
        level: 'error',
      })
    } else {
      addToast({
        title: 'Successfully deleted API key',
        body: 'Successfully deleted API key from your space.',
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
          <DropdownMenuItem onSelect={handleCopy}>
            <ClipboardIcon /> Copy
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={handleDelete}>
            <Trash2Icon /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

export default ApiKeyContextMenu
