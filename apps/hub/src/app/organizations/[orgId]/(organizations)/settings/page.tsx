import { CircleXIcon } from 'lucide-react'
import { Field, FieldLabel } from '@gruent/libs/frontend/components/core/field'
import { Input } from '@gruent/libs/frontend/components/core/input'
import DeleteOrganizationModal from '@gruent/hub/components/modals/DeleteOrganizationModal'
import gruentClient from '@gruent/hub/lib/gruent'
import getAccessToken from '@gruent/hub/util/getAccessToken'
import OrganizationSettingsForm from '@gruent/hub/components/organisms/OrganizationSettingsForm'
import Container from '@gruent/libs/frontend/components/Container'
import OpenModalButton from '@gruent/libs/frontend/components/OpenModalButton'
import { Alert, AlertDescription, AlertTitle } from '@gruent/libs/frontend/components/core/alert'

export const metadata = {
  title: 'Organization settings | Gruent',
}

const OrganizationSettingsPage = async ({ params }) => {
  const { orgId } = await params

  const accessToken = await getAccessToken()
  if (!accessToken) return null

  const { data: organization, errors } = await gruentClient(accessToken).organizations.get(orgId)

  if (errors && errors.length > 0) {
    return (
      <div className="mt-4 px-8 py-2">
        <Alert variant="destructive" className="w-fit max-w-xl">
          <CircleXIcon />
          <AlertTitle>Could not get the organization details</AlertTitle>
          <AlertDescription>{`${errors[0]}`}</AlertDescription>
        </Alert>
      </div>
    )
  }

  if (!organization) {
    return (
      <div className="mt-4 px-8 py-2">
        <Alert variant="destructive" className="w-fit max-w-xl">
          <CircleXIcon />
          <AlertTitle>Organization not found</AlertTitle>
          <AlertDescription>{`This organization does not exist. Try logging out and logging back in.`}</AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <>
      <DeleteOrganizationModal organization={organization} />
      <Container className="mb-4">
        <h1 className="text-xl">Organization Settings</h1>
        <p>
          <small>Change how your organization functions.</small>
        </p>
      </Container>
      <Container className="mb-4">
        <section
          className="relative bg-gray-50 rounded-sm py-5 px-10 border border-gray-200 dark:bg-gray-900 dark:border-gray-800"
          style={{ boxShadow: '3px 3px 10px 0 rgba(0, 0, 0, 0.03)' }}
        >
          <OrganizationSettingsForm organization={organization} />
          <hr className="my-6" />
          <Field className="my-3">
            <FieldLabel htmlFor="orgId">Organization Id</FieldLabel>
            <Input
              id="orgId"
              name="orgId"
              value={organization.id}
              autoComplete="off"
              spellCheck={false}
              readOnly
            />
          </Field>
        </section>
      </Container>
      <Container className="mb-4">
        <section
          className="relative bg-gray-50 rounded-sm py-5 px-10 border border-red-200 dark:bg-gray-900 dark:border-gray-800"
          style={{ boxShadow: '3px 3px 10px 0 rgba(0, 0, 0, 0.03)' }}
        >
          <h2>Danger Zone</h2>
          <p className="text-xs mb-2">
            These settings may have significant and irreversible changes to your organization.
          </p>
          <OpenModalButton
            id="deleteOrganizationButton"
            variant="destructive"
            modalId="deleteOrganization"
          >
            Delete organization
          </OpenModalButton>
        </section>
      </Container>
    </>
  )
}

export default OrganizationSettingsPage
