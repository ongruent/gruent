'use client'

import { FC, useCallback } from 'react'
import Modal from '@gruent/libs/frontend/components/Modal'
import { useMutation } from '@tanstack/react-query'
import { addToast } from '@gruent/libs/frontend/hooks/useToast'
import { closeModal } from '@gruent/libs/frontend/hooks/useModal'
import gruentClient from '@gruent/hub/lib/gruent'
import { useRouter } from 'next/navigation'
import useAuth from '@gruent/hub/hooks/useAuth'

type Props = {
  orgId: string
  spaceId: string
  connectionId: string
}

const DeleteConnectionModal: FC<Props> = ({ orgId, spaceId, connectionId }) => {
  const { accessToken } = useAuth()
  const router = useRouter()

  const deleteConnectionMutation = useMutation({
    mutationKey: ['deleteConnection'],
    mutationFn: async () => {
      if (!accessToken) return

      const { errors } = await gruentClient(accessToken).connections.delete(spaceId, connectionId)

      if (errors && errors.length > 0) {
        addToast({
          title: 'Could not delete connection',
          body: `The connection could not be deleted: ${errors[0]}`,
          level: 'error',
        })
        return false
      }

      closeModal()
      // TODO: revalidatePath()
      router.push(`/organizations/${orgId}/spaces/${spaceId}/connections`)

      return true
    },
  })

  const handleClose = () => {
    closeModal()
  }

  const handleSubmit = useCallback(() => {
    deleteConnectionMutation.mutate()
  }, [deleteConnectionMutation])

  return (
    <Modal
      id="deleteConnection"
      title="Delete a connection"
      onAccept={handleSubmit}
      onClose={handleClose}
      acceptText="Delete"
    >
      <h2>Delete a connection</h2>
      <p className="text-gray-500">
        <small>Delete a connection from your space.</small>
      </p>
      <div className="mb-2">
        <strong>Are you sure you want to delete this connection?</strong>
      </div>
    </Modal>
  )
}

export default DeleteConnectionModal
