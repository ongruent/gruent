import { CircleXIcon } from 'lucide-react'
import { Field, FieldLabel } from '@gruent/libs/frontend/components/core/field'
import { Input } from '@gruent/libs/frontend/components/core/input'
import gruentClient from '@gruent/hub/lib/gruent'
import DeleteThingModal from '@gruent/hub/components/modals/DeleteThingModal'
import PolicySection from './PolicySection'
import { Policy } from '@gruent/libs/gruent-js/src/policies'
import ThingSettingsForm from '@gruent/hub/components/organisms/ThingSettingsForm'
import getAccessToken from '@gruent/hub/util/getAccessToken'
import ExportThingButton from '@gruent/hub/components/molecules/ExportThingButton'
import Container from '@gruent/libs/frontend/components/Container'
import OpenModalButton from '@gruent/libs/frontend/components/OpenModalButton'
import { Alert, AlertDescription, AlertTitle } from '@gruent/libs/frontend/components/core/alert'

export const metadata = {
  title: 'Thing details | GRUENT',
}

const ThingDetailsPage = async ({ params }) => {
  const { orgId, spaceId, thingId } = await params

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

  const { data: thing, errors: getThingErrors } = await gruentClient(accessToken).things.get(
    spaceId,
    thingId,
  )

  if (getThingErrors && getThingErrors.length > 0) {
    return (
      <div className="mt-4 px-8 py-2">
        <Alert variant="destructive" className="w-fit max-w-xl">
          <CircleXIcon />
          <AlertTitle>Could not get the thing details</AlertTitle>
          <AlertDescription>{`${getThingErrors[0]}`}</AlertDescription>
        </Alert>
      </div>
    )
  }

  if (!thing || !thing.attributes) {
    return (
      <div className="mt-4 px-8 py-2">
        <Alert variant="destructive" className="w-fit max-w-xl">
          <CircleXIcon />
          <AlertTitle>Could not get the thing details</AlertTitle>
          <AlertDescription>{`The thing details could not be retrieved. Try logging out and logging back in.`}</AlertDescription>
        </Alert>
      </div>
    )
  }

  const attributes = JSON.parse(thing.attributes.toString())

  const { policy: policyResponse, policyErrors } = await (async () => {
    if (!attributes || !attributes.certificateId) return { policy: null, policyErrors: null }

    const { data: policy, errors: policyErrors } = await gruentClient(accessToken).policies.get(
      spaceId,
      attributes.certificateId,
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
      <DeleteThingModal orgId={orgId} spaceId={spaceId} thingId={thingId} />
      <Container className="mb-6">
        <h1 className="text-xl">{thing.name}</h1>
        <p className="text-xs">Modify the connection details of your thing.</p>
      </Container>
      <Container className="mb-4">
        <section
          className="relative bg-gray-50 rounded-sm py-5 px-10 border border-gray-200 dark:bg-gray-900 dark:border-gray-800"
          style={{ boxShadow: '3px 3px 10px 0 rgba(0, 0, 0, 0.03)' }}
        >
          {thing && (
            <>
              <h2 className="mb-4">Attributes</h2>
              <ThingSettingsForm orgId={orgId} spaceId={spaceId} thing={thing} secrets={secrets} />
              {thing.thingCategory === 'MQTT_CLIENT' && (
                <div>
                  {policy && (
                    <PolicySection
                      policy={policy}
                      revoke={revoke ?? false}
                      spaceId={spaceId}
                      certificateId={attributes.certificateId}
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
            <FieldLabel htmlFor="thingId">Thing ID</FieldLabel>
            <Input
              id="thingId"
              name="thingId"
              value={thing.id}
              autoComplete="off"
              spellCheck={false}
              readOnly
            />
          </Field>
          <hr className="my-6" />
          <h2 className="mb-2">Export</h2>
          <ExportThingButton
            name={thing.name}
            category={thing.thingCategory}
            attributes={attributes}
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
            These settings may have significant and irreversible changes to your thing.
          </p>
          <OpenModalButton variant="destructive" modalId="deleteThing">
            Delete thing
          </OpenModalButton>
        </section>
      </Container>
    </>
  )
}

export default ThingDetailsPage
