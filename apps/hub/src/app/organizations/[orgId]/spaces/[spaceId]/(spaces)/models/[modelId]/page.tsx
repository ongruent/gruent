import { CircleXIcon, TriangleAlertIcon } from 'lucide-react'
import { Field, FieldLabel } from '@gruent/libs/frontend/components/core/field'
import { Input } from '@gruent/libs/frontend/components/core/input'
import ModelSettingsForm from '@gruent/hub/components/organisms/ModelSettingsForm'
import DeleteModelModal from '@gruent/hub/components/modals/DeleteModelModal'
import gruentClient from '@gruent/hub/lib/gruent'
import getAccessToken from '@gruent/hub/util/getAccessToken'
import ExportModelButton from '@gruent/hub/components/molecules/ExportModelButton'
import OpenModalButton from '@gruent/libs/frontend/components/OpenModalButton'
import Container from '@gruent/libs/frontend/components/Container'
import { Alert, AlertDescription, AlertTitle } from '@gruent/libs/frontend/components/core/alert'

export const metadata = {
  title: 'Model details | Gruent',
}

const ModelDetailsPage = async ({ params }) => {
  const { orgId, spaceId, modelId } = await params

  const accessToken = await getAccessToken()
  if (!accessToken) return null

  const { data: model, errors } = await gruentClient(accessToken).models.get(spaceId, modelId)

  if (errors && errors.length > 0)
    return (
      <Alert variant="destructive" className="w-fit max-w-xl">
        <CircleXIcon />
        <AlertTitle>Could not get the model details</AlertTitle>
        <AlertDescription>{`${errors[0]}`}</AlertDescription>
      </Alert>
    )

  if (!model)
    return (
      <Alert variant="destructive" className="w-fit max-w-xl">
        <CircleXIcon />
        <AlertTitle>Could not get the model details</AlertTitle>
        <AlertDescription>{`The model details could not be retrieved. Try logging out and logging back in.`}</AlertDescription>
      </Alert>
    )
  const { attributes, error: parseError } = (() => {
    try {
      return { attributes: JSON.parse(model.attributes as string) }
    } catch (_err) {
      return { attributes: {}, error: "Could not parse the model's attributes." }
    }
  })()

  return (
    <>
      <DeleteModelModal orgId={orgId} spaceId={spaceId} model={model} />
      <Container className="mb-6">
        <h1 className="text-xl">Model</h1>
        <p className="text-xs">Modify the shape of your data.</p>
      </Container>
      <Container className="mb-4">
        <section
          className="relative bg-gray-50 rounded-sm py-5 px-10 border border-gray-200 dark:bg-gray-900 dark:border-gray-800"
          style={{ boxShadow: '3px 3px 10px 0 rgba(0, 0, 0, 0.03)' }}
        >
          <h2 className="mb-4">Attributes</h2>
          <ModelSettingsForm spaceId={spaceId} initialModel={model} />
        </section>
      </Container>
      <Container className="mb-4">
        <section
          className="relative bg-gray-50 rounded-sm py-5 px-10 border border-gray-200 dark:bg-gray-900 dark:border-gray-800"
          style={{ boxShadow: '3px 3px 10px 0 rgba(0, 0, 0, 0.03)' }}
        >
          <Field className="my-3">
            <FieldLabel htmlFor="modelId">Model Id</FieldLabel>
            <Input
              id="modelId"
              name="modelId"
              value={model.id}
              autoComplete="off"
              spellCheck={false}
              readOnly
            />
          </Field>
          <hr className="my-6" />
          <h2 className="mb-2">Export</h2>
          {parseError && (
            <Alert className="w-fit max-w-xl">
              <TriangleAlertIcon />
              <AlertTitle>Could not export the model</AlertTitle>
              <AlertDescription>{`${parseError}`}</AlertDescription>
            </Alert>
          )}
          {!parseError && <ExportModelButton name={model.name} attributes={attributes} />}
        </section>
      </Container>
      <Container className="mb-4">
        <section
          className="relative bg-gray-50 rounded-sm py-5 px-10 border border-red-200 dark:bg-gray-900 dark:border-gray-800"
          style={{ boxShadow: '3px 3px 10px 0 rgba(0, 0, 0, 0.03)' }}
        >
          <h2 className="">Danger Zone</h2>
          <p className="text-xs mb-2">
            These settings may have significant and irreversible changes to your space
          </p>
          <OpenModalButton variant="destructive" modalId="deleteModel">
            <span>Delete model</span>
          </OpenModalButton>
        </section>
      </Container>
    </>
  )
}

export default ModelDetailsPage
