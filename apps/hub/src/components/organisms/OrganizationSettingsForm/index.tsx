'use client'

import useAuth from '@gruent/hub/hooks/useAuth'
import gruentClient from '@gruent/hub/lib/gruent'
import { Button } from '@gruent/libs/frontend/components/core/button'
import { Field, FieldLabel } from '@gruent/libs/frontend/components/core/field'
import { Input } from '@gruent/libs/frontend/components/core/input'
import { addToast } from '@gruent/libs/frontend/hooks/useToast'
import { Organization } from '@prisma/client'
import { useMutation } from '@tanstack/react-query'
import { FC, FormEventHandler, useCallback, useState } from 'react'

type Props = {
  organization: Organization
}

const OrganizationSettingsForm: FC<Props> = ({ organization: initialOrganization }) => {
  const [organization, setOrganization] = useState<Organization>(initialOrganization)

  const { accessToken } = useAuth()

  const updateOrganizationMutation = useMutation({
    mutationKey: ['updateOrganization', organization.id],
    mutationFn: async (organization: Organization) => {
      if (!accessToken) return

      const { errors } = await gruentClient(accessToken).organizations.update(organization)

      if (errors && errors.length > 0) {
        addToast({
          title: 'Could not update the organization',
          body: errors[0],
          level: 'error',
        })

        return errors[0]
      }

      addToast({
        title: 'Successfully updated the organization',
        body: 'Your new settings have been saved.',
        level: 'success',
      })

      return
    },
  })

  const handleSubmit: FormEventHandler<HTMLFormElement> = useCallback(
    (e) => {
      e.preventDefault()
      updateOrganizationMutation.mutate(organization)
    },
    [updateOrganizationMutation, organization],
  )

  return (
    <form onSubmit={handleSubmit}>
      <Field className="my-3">
        <FieldLabel htmlFor="organizationName">Organization Name</FieldLabel>
        <Input
          id="organizationName"
          name="organizationName"
          value={organization.name}
          onChange={(e) => {
            const name = e.target.value
            setOrganization((current) => ({ ...current, name }))
          }}
          autoComplete="off"
          spellCheck={false}
        />
      </Field>
      <Button type="submit" disabled={organization.name === initialOrganization.name}>
        Save
      </Button>
    </form>
  )
}

export default OrganizationSettingsForm
