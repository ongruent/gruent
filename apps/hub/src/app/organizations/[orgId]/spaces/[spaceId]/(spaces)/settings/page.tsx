import { CircleXIcon } from 'lucide-react'
import { Field, FieldLabel } from '@gruent/libs/frontend/components/core/field'
import { Input } from '@gruent/libs/frontend/components/core/input'
import DeleteSpaceModal from '@gruent/hub/components/modals/DeleteSpaceModal'
import SpaceSettingsForm from '@gruent/hub/components/organisms/SpaceSettingsForm'
import gruentClient from '@gruent/hub/lib/gruent'
import getAccessToken from '@gruent/hub/util/getAccessToken'
import Container from '@gruent/libs/frontend/components/Container'
import OpenModalButton from '@gruent/libs/frontend/components/OpenModalButton'
import { Alert, AlertDescription, AlertTitle } from '@gruent/libs/frontend/components/core/alert'
export const metadata = {
  title: 'Space settings | Gruent',
}

const SpaceSettingsPage = async ({ params }) => {
  const { orgId, spaceId } = await params

  const accessToken = await getAccessToken()
  if (!accessToken) return null

  const { data: space, errors } = await gruentClient(accessToken).spaces.get(orgId, spaceId)

  if (errors && errors.length > 0) {
    return (
      <div className="mt-4 px-8 py-2">
        <Alert variant="destructive" className="w-fit max-w-xl">
          <CircleXIcon />
          <AlertTitle>Could not get the space details</AlertTitle>
          <AlertDescription>{`${errors[0]}`}</AlertDescription>
        </Alert>
      </div>
    )
  }

  if (!space) {
    return (
      <div className="mt-4 px-8 py-2">
        <Alert variant="destructive" className="w-fit max-w-xl">
          <CircleXIcon />
          <AlertTitle>Could not get the space details</AlertTitle>
          <AlertDescription>{`The space details could not be retrieved. Try logging out and logging back in.`}</AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <>
      <DeleteSpaceModal orgId={orgId} space={space} />
      <Container className="mb-4">
        <h1 className="text-xl">Space Settings</h1>
        <p>
          <small>Change how your space functions.</small>
        </p>
      </Container>
      <Container className="mb-4">
        <section
          className="relative bg-gray-50 rounded-sm py-5 px-10 border border-gray-200 dark:bg-gray-900 dark:border-gray-800"
          style={{ boxShadow: '3px 3px 10px 0 rgba(0, 0, 0, 0.03)' }}
        >
          <SpaceSettingsForm orgId={orgId} space={space} />
          <hr className="my-6" />
          <Field className="my-3">
            <FieldLabel htmlFor="spaceId">Space Id</FieldLabel>
            <Input
              id="spaceId"
              name="spaceId"
              value={space.id}
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
            These settings may have significant and irreversible changes to your space.
          </p>
          <OpenModalButton id="deleteSpaceButton" variant="destructive" modalId="deleteSpace">
            Delete space
          </OpenModalButton>
        </section>
      </Container>
    </>
  )
}

export default SpaceSettingsPage
