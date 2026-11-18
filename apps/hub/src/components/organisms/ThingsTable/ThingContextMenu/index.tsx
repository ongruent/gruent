'use client'

import { FC } from 'react'
import { addToast } from '@gruent/libs/frontend/hooks/useToast'
import ContextMenu from '@gruent/hub/components/atoms/ContextMenu'
import { handleDeleteThing } from '@gruent/hub/actions/things'
import { Trash2Icon } from 'lucide-react'
type Props = {
  thingId: string
  spaceId: string
  className?: string
}

const ThingContextMenu: FC<Props> = ({ thingId, spaceId }) => {
  const contextMenuButtons = [
    {
      icon: Trash2Icon,
      title: 'Delete',
      onClick: async () => {
        const { error } = await handleDeleteThing(spaceId, thingId)
        if (error) {
          addToast({
            title: 'Could not delete the thing',
            body: `The thing that you selected could not be deleted: ${error}`,
            level: 'error',
          })
        } else {
          addToast({
            title: 'Successfully deleted thing',
            body: 'Successfully deleted thing from your space.',
            level: 'success',
          })
        }
      },
    },
  ]

  return (
    <>
      <ContextMenu contextMenuButtons={contextMenuButtons} />
    </>
  )
}

export default ThingContextMenu
