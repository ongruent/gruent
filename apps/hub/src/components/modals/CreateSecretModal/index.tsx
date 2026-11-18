'use client'

import { FC, useCallback, useState } from 'react'
import Modal from '@gruent/libs/frontend/components/Modal'
import { addToast } from '@gruent/libs/frontend/hooks/useToast'
import { closeModal } from '@gruent/libs/frontend/hooks/useModal'
import { Field, FieldLabel } from '@gruent/libs/frontend/components/core/field'
import { Input } from '@gruent/libs/frontend/components/core/input'
import { handleAddSecret } from '@gruent/hub/actions/secrets'

type Props = {
  spaceId: string
}

const CreateSecretModal: FC<Props> = ({ spaceId }) => {
  const [name, setName] = useState('')
  const [value, setValue] = useState('')

  const handleClose = useCallback(() => {
    closeModal()
  }, [])

  const handleSubmit = useCallback(async () => {
    const { error } = await handleAddSecret(spaceId, name, value)
    if (error) {
      addToast({
        title: 'Could not add secret to space',
        body: `Could not add secret to space: ${error}`,
        level: 'warning',
      })
    } else {
      handleClose()
      addToast({
        title: 'Successfully added secret to space',
        body: 'You may now use this secret within thing configurations.',
        level: 'success',
      })
    }
  }, [spaceId, name, value, handleClose])

  return (
    <Modal
      id="addSecret"
      title="Add a secret"
      onAccept={handleSubmit}
      onClose={handleClose}
      acceptText="Create"
      className="min-w-[400px] max-w-[80vw] overflow-y-auto"
    >
      <h2>Add a secret</h2>
      <p className="text-gray-500">
        <small>Add a secret to your space to use within thing configurations.</small>
      </p>
      <form onSubmit={handleSubmit}>
        <Field className="my-3">
          <FieldLabel htmlFor="name">Name</FieldLabel>
          <Input
            id="name"
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </Field>
        <Field className="my-3">
          <FieldLabel htmlFor="value">Value</FieldLabel>
          <Input
            id="value"
            name="value"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </Field>
      </form>
    </Modal>
  )
}

export default CreateSecretModal
