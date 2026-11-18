'use client'

import { FC, useCallback, useRef } from 'react'
import Modal from '@gruent/libs/frontend/components/Modal'
import { Field, FieldLabel } from '@gruent/libs/frontend/components/core/field'
import { Input } from '@gruent/libs/frontend/components/core/input'
import { PermissionSet } from '@prisma/client'
import { addToast } from '@gruent/libs/frontend/hooks/useToast'
import { closeModal } from '@gruent/libs/frontend/hooks/useModal'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@gruent/libs/frontend/components/core/select'
import { handleAddApiKey } from '@gruent/hub/actions/apiKeys'

type Props = {
  orgId: string
  spaceId?: string
  permissionSets: PermissionSet[]
}

const CreateApiKeyModal: FC<Props> = ({ orgId, spaceId, permissionSets }) => {
  const formRef = useRef<HTMLFormElement>(null)

  const handleFormClose = useCallback(() => {
    formRef.current?.reset()
    closeModal()
  }, [formRef])

  const handleFormSubmit = () => {
    formRef.current?.requestSubmit()
  }

  return (
    <Modal
      id="addApiKey"
      title="Add an API key"
      acceptText="Create"
      onAccept={handleFormSubmit}
      onClose={handleFormClose}
    >
      <h2>Add an API key</h2>
      <p className="text-gray-500">
        <small>
          Create an {spaceId ? 'space' : 'organization'} API key to programatically edit your{' '}
          {spaceId ? 'space' : 'organization'}.
        </small>
      </p>
      <form
        ref={formRef}
        className="relative mb-4"
        onSubmit={async (e) => {
          e.preventDefault()

          const formData = new FormData(e.target as HTMLFormElement)
          const name = formData.get('name') as string
          const permissionSetId = formData.get('permissionSetId') as string

          const { error } = await handleAddApiKey(orgId, permissionSetId, name, spaceId)
          if (error) {
            addToast({
              title: 'Could not create the API key',
              body: `The API key that you selected could not be created: ${error}`,
              level: 'error',
            })
          } else {
            formRef.current?.reset()
            closeModal()

            addToast({
              title: 'Successfully created API key',
              body: 'Successfully created the API key for your space.',
              level: 'success',
            })
          }
        }}
      >
        <Field className="my-4">
          <FieldLabel htmlFor="name">Name</FieldLabel>
          <Input
            id="name"
            name="name"
            placeholder="Name of the API key"
            autoComplete="off"
            spellCheck={false}
          />
        </Field>
        <Field className="my-3">
          <FieldLabel htmlFor="permissionSetId">Permission Set</FieldLabel>
          <Select name="permissionSetId">
            <SelectTrigger id="permissionSetId" className="w-full">
              <SelectValue placeholder="Select an option" />
            </SelectTrigger>
            <SelectContent>
              {permissionSets.map((permissionSet) => {
                const { name, id } = permissionSet
                return (
                  <SelectItem key={id} value={id}>
                    {name}
                  </SelectItem>
                )
              })}
            </SelectContent>
          </Select>
        </Field>
      </form>
    </Modal>
  )
}

export default CreateApiKeyModal
