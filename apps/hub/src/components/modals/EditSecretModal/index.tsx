'use client'

import { FC, useCallback, useRef } from 'react'
import Modal from '@gruent/libs/frontend/components/Modal'
import { useMutation } from '@tanstack/react-query'
import { closeModal } from '@gruent/libs/frontend/hooks/useModal'
import { useRouter } from 'next/navigation'
import { Field, FieldLabel } from '@gruent/libs/frontend/components/core/field'
import { Input } from '@gruent/libs/frontend/components/core/input'
import { handleUpdateSecret } from '@gruent/hub/actions/secrets'
import { addToast } from '@gruent/libs/frontend/hooks/useToast'

type Props = {
  spaceId: string
  name: string
  showModal: boolean
  onClose?: () => void
}

const EditSecretModal: FC<Props> = ({ spaceId, name: secretName, showModal, onClose }) => {
  const router = useRouter()

  const formRef = useRef<HTMLFormElement>(null)

  const updateSecretMutation = useMutation({
    mutationKey: ['updateSecretMutation', spaceId, secretName],
    mutationFn: async ({ name, value }: { name: string; value: string }) => {
      const { error } = await handleUpdateSecret(spaceId, name, value)

      if (error) {
        addToast({
          title: 'Could not update secret',
          body: error,
          level: 'error',
        })
        return false
      }

      addToast({
        title: `Successfully updated the secret`,
        body: `The secret has been successfully been updated. These changes should be reflected immediately.`,
        level: 'success',
      })

      formRef.current?.reset()
      closeModal()
      router.refresh()
      return true
    },
  })

  const handleClose = useCallback(() => {
    formRef.current?.reset()
    closeModal()
    if (onClose) onClose()
  }, [formRef, onClose])

  const handleSubmit = useCallback(() => {
    if (!formRef.current) return
    const formData = new FormData(formRef.current)
    const name = formData.get('name') as string
    const value = formData.get('value') as string

    updateSecretMutation.mutate({ name, value })
  }, [formRef, updateSecretMutation])

  if (!showModal) return null

  return (
    <Modal
      id="editSecret"
      title="Edit secret"
      onAccept={handleSubmit}
      onClose={handleClose}
      acceptText="Update"
    >
      <h2>Edit secret</h2>
      <p className="text-gray-500">
        <small>Change a secret&apos;s name.</small>
      </p>
      <div className="relative">
        <form ref={formRef} onSubmit={(e) => e.preventDefault()} className="mb-4">
          <Field className="my-3">
            <FieldLabel htmlFor="name">Name</FieldLabel>
            <Input
              id="name"
              name="name"
              defaultValue={secretName}
              autoComplete="off"
              spellCheck={false}
            />
          </Field>
          <Field className="my-3">
            <FieldLabel htmlFor="value">Value</FieldLabel>
            <Input id="value" name="value" autoComplete="off" spellCheck={false} />
          </Field>
        </form>
      </div>
    </Modal>
  )
}

export default EditSecretModal
