import { CircleXIcon } from 'lucide-react'
import { Field, FieldLabel } from '@gruent/libs/frontend/components/core/field'
import { Input } from '@gruent/libs/frontend/components/core/input'
import gruentClient from '@gruent/hub/lib/gruent'
import DeleteConnectionModal from '@gruent/hub/components/modals/DeleteConnectionModal'
import PolicySection from './PolicySection'
import { Policy } from '@gruent/libs/gruent-js/src/policies'
import ConnectionSettingsForm from '@gruent/hub/components/organisms/ConnectionSettingsForm'
import getAccessToken from '@gruent/hub/util/getAccessToken'
import ExportConnectionButton from '@gruent/hub/components/molecules/ExportConnectionButton'
import Container from '@gruent/libs/frontend/components/Container'
import OpenModalButton from '@gruent/libs/frontend/components/OpenModalButton'
import { Alert, AlertDescription, AlertTitle } from '@gruent/libs/frontend/components/core/alert'

export const metadata = {
  title: 'Connection details | Gruent',
}

const ConnectionDetailsPage = async ({ params }) => {
  const { orgId, spaceId, connectionId } = await params

  const accessToken = await getAccessToken()
  if (!accessToken) return null

  const { data: secrets, errors } = await gruentClient(accessToken).secrets.list(spaceId)

  if (errors && errors.length > 0)
    return (
      <div className="mt-4 px-8 py-2 max-w-full mb-10">
        <Alert variant="destructive" className="w-fit max-w-xl">
          <CircleXIcon />
          <AlertTitle>Could not get the secrets in the space</AlertTitle>
          <AlertDescription>{`${errors[0]}`}</AlertDescription>
        </Alert>
      </div>
    )

  if (!secrets)
    return (
      <div className="mt-4 px-8 py-2 max-w-full mb-10">
        <Alert variant="destructive" className="w-fit max-w-xl">
          <CircleXIcon />
          <AlertTitle>Could not get the secrets</AlertTitle>
          <AlertDescription>{`The secrets could not be retrieved. Try logging out and logging back in.`}</AlertDescription>
        </Alert>
      </div>
    )

  const { data: connection, errors: getConnectionErrors } = await gruentClient(
    accessToken,
  ).connections.get(spaceId, connectionId)

  if (getConnectionErrors && getConnectionErrors.length > 0) {
    return (
      <div className="mt-4 px-8 py-2">
        <Alert variant="destructive" className="w-fit max-w-xl">
          <CircleXIcon />
          <AlertTitle>Could not get the connection details</AlertTitle>
          <AlertDescription>{`${getConnectionErrors[0]}`}</AlertDescription>
        </Alert>
      </div>
    )
  }

  if (!connection || !connection.attributes) {
    return (
      <div className="mt-4 px-8 py-2">
        <Alert variant="destructive" className="w-fit max-w-xl">
          <CircleXIcon />
          <AlertTitle>Could not get the connection details</AlertTitle>
          <AlertDescription>{`The connection details could not be retrieved. Try logging out and logging back in.`}</AlertDescription>
        </Alert>
      </div>
    )
  }

  const { policy: policyResponse, policyErrors } = await (async () => {
    if (!connection.attributes || !connection.attributes.certificateId) return { policy: null, policyErrors: null }

    const { data: policy, errors: policyErrors } = await gruentClient(accessToken).policies.get(
      spaceId,
      connection.attributes.certificateId,
    )

    if (policyErrors && policyErrors.length > 0) return { policy: null, policyErrors }
    return { policy, policyErrors: null }
  })()

  if (policyErrors && policyErrors.length > 0)
    return (
      <>
        <Alert variant="destructive" className="w-fit max-w-xl">
          <CircleXIcon />
          <AlertTitle>Could not get the policy</AlertTitle>
          <AlertDescription>{`${policyErrors[0]}`}</AlertDescription>
        </Alert>
      </>
    )

  const policy = (() => {
    if (policyResponse && policyResponse.policy)
      return JSON.parse(policyResponse.policy.toString()) as Policy
  })()

  const revoke = policyResponse?.revoke

  return (
    <>
      <DeleteConnectionModal orgId={orgId} spaceId={spaceId} connectionId={connectionId} />
      <Container className="mb-6">
        <h1 className="text-xl">{connection.name}</h1>
        <p className="text-xs">Modify the connection details of your connection.</p>
      </Container>
      <Container className="mb-4">
        <section
          className="relative bg-gray-50 rounded-sm py-5 px-10 border border-gray-200 dark:bg-gray-900 dark:border-gray-800"
          style={{ boxShadow: '3px 3px 10px 0 rgba(0, 0, 0, 0.03)' }}
        >
          {connection && (
            <>
              <h2 className="mb-4">Attributes</h2>
              <ConnectionSettingsForm
                orgId={orgId}
                spaceId={spaceId}
                connection={connection}
                secrets={secrets}
              />
              {connection.connectionCategory === 'MQTT_CLIENT' && (
                <div>
                  {policy && (
                    <PolicySection
                      policy={policy}
                      revoke={revoke ?? false}
                      spaceId={spaceId}
                      certificateId={connection.attributes.certificateId}
                      className="my-4"
                    />
                  )}
                </div>
              )}
            </>
          )}
        </section>
      </Container>
      <Container className="mb-4">
        <section
          className="relative bg-gray-50 rounded-sm py-5 px-10 border border-gray-200 dark:bg-gray-900 dark:border-gray-800"
          style={{ boxShadow: '3px 3px 10px 0 rgba(0, 0, 0, 0.03)' }}
        >
          <Field className="my-3">
            <FieldLabel htmlFor="connectionId">Connection ID</FieldLabel>
            <Input
              id="connectionId"
              name="connectionId"
              value={connection.id}
              autoComplete="off"
              spellCheck={false}
              readOnly
            />
          </Field>
          <hr className="my-6" />
          <h2 className="mb-2">Export</h2>
          <ExportConnectionButton
            name={connection.name}
            category={connection.connectionCategory}
            attributes={connection.attributes}
          />
        </section>
      </Container>
      <Container className="mb-4">
        <section
          className="relative bg-gray-50 rounded-sm py-5 px-10 border border-red-200 dark:bg-gray-900 dark:border-gray-800"
          style={{ boxShadow: '3px 3px 10px 0 rgba(0, 0, 0, 0.03)' }}
        >
          <h2>Danger Zone</h2>
          <p className="text-xs mb-2">
            These settings may have significant and irreversible changes to your connection.
          </p>
          <OpenModalButton variant="destructive" modalId="deleteConnection">
            Delete connection
          </OpenModalButton>
        </section>
      </Container>
    </>
  )
}

export default ConnectionDetailsPage
