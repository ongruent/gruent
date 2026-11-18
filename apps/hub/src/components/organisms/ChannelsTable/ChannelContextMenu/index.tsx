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
import {
  handleDeleteChannel,
  handlePublishChannel,
  handleUnpublishChannel,
} from '@gruent/hub/actions/channels'
import { Channel } from '@prisma/client'
import { CloudIcon, CloudOffIcon, EllipsisVerticalIcon, Trash2Icon } from 'lucide-react'

type Props = {
  channel: Channel
  spaceId: string
  className?: string
}

const ChannelContextMenu: FC<Props> = ({ channel, spaceId }) => {
  const handlePublish = async () => {
    const { error } = await handlePublishChannel(spaceId, channel.id)
    if (error) {
      addToast({
        title: 'Could not publish the channel',
        body: `The channel could not be published: ${error}`,
        level: 'error',
      })
    } else {
      addToast({
        title: 'Publish request sent',
        body: 'The channel should be published soon. This may take a few seconds.',
        level: 'success',
      })
    }
  }

  const handleUnpublish = async () => {
    const { error } = await handleUnpublishChannel(spaceId, channel.id)
    if (error) {
      addToast({
        title: 'Could not unpublish the channel',
        body: `The channel could not be unpublished: ${error}`,
        level: 'error',
      })
    } else {
      addToast({
        title: 'Unpublish request sent',
        body: 'The channel should be unpublished soon. This may take a few seconds.',
        level: 'success',
      })
    }
  }

  const handleDelete = async () => {
    const { error } = await handleDeleteChannel(spaceId, channel.id)
    if (error) {
      addToast({
        title: 'Could not delete the channel',
        body: `The channel could not be deleted: ${error}`,
        level: 'error',
      })
    } else {
      addToast({
        title: 'Successfully deleted channel',
        body: 'Successfully deleted the channel from your space.',
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
          {!channel.publishedAt ? (
            <DropdownMenuItem onSelect={handlePublish}>
              <CloudIcon /> Publish
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={handleUnpublish}>
              <CloudOffIcon /> Unpublish
            </DropdownMenuItem>
          )}
          <DropdownMenuItem variant="destructive" onSelect={handleDelete}>
            <Trash2Icon /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

export default ChannelContextMenu
