'use client'

import { FC } from 'react'
import { addToast } from '@gruent/libs/frontend/hooks/useToast'
import ContextMenu from '@gruent/hub/components/atoms/ContextMenu'
import { handleDeleteModel } from '@gruent/hub/actions/models'
import { Trash2Icon } from 'lucide-react'

type Props = {
  modelId: string
  spaceId: string
  className?: string
}

const ModelContextMenu: FC<Props> = ({ modelId, spaceId }) => {
  const contextMenuButtons = [
    {
      icon: Trash2Icon,
      title: 'Delete',
      onClick: async () => {
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
      },
    },
  ]

  return (
    <>
      <ContextMenu contextMenuButtons={contextMenuButtons} />
    </>
  )
}

export default ModelContextMenu
