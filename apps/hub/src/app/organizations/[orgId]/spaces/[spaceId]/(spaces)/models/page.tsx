import gruentClient from '@gruent/hub/lib/gruent'
import getAccessToken from '@gruent/hub/util/getAccessToken'
import CreateModelModal from '@gruent/hub/components/modals/CreateModelModal'
import ModelsTable from '@gruent/hub/components/organisms/ModelsTable'
import Container from '@gruent/libs/frontend/components/Container'
import OpenModalButton from '@gruent/libs/frontend/components/OpenModalButton'
import { CirclePlusIcon, CircleXIcon, ShapesIcon } from 'lucide-react'
import ListTablePlaceholder from '@gruent/hub/components/molecules/ListTablePlaceholder'
import { Alert, AlertDescription, AlertTitle } from '@gruent/libs/frontend/components/core/alert'
import { Tag } from '@prisma/client'

export const metadata = {
  title: 'Models | GRUENT',
}

const ModelsPage = async ({ params, searchParams }) => {
  const { orgId, spaceId } = await params
  const { page: requestedPage = 1, q: filter, tagFilter: tagFilterString } = await searchParams

  const tagFilter = tagFilterString ? tagFilterString.split(',') : undefined

  const accessToken = await getAccessToken()
  if (!accessToken) return null

  const {
    data: models,
    errors,
    page,
    totalPages,
    totalResults,
  } = await gruentClient(accessToken).models.list(spaceId, {
    page: requestedPage,
    filter,
    tagFilter,
  })

  if (errors && errors.length > 0) {
    return (
      <div className="mt-4 px-8 py-2">
        <Alert variant="destructive" className="w-fit max-w-xl">
          <CircleXIcon />
          <AlertTitle>Could not list the models for this space</AlertTitle>
          <AlertDescription>{`${errors[0]}`}</AlertDescription>
        </Alert>
      </div>
    )
  }

  if (!models) {
    return (
      <div className="mt-4 px-8 py-2">
        <Alert variant="destructive" className="w-fit max-w-xl">
          <CircleXIcon />
          <AlertTitle>Could not list the models for this space</AlertTitle>
          <AlertDescription>{`The models could not be listed. Try logging out and logging back in.`}</AlertDescription>
        </Alert>
      </div>
    )
  }

  const { data: tagListResponse, errors: tagListErrors } =
    await gruentClient(accessToken).tags.list(spaceId)

  if (tagListErrors && tagListErrors.length > 0) {
    return (
      <div className="mt-4 px-8 py-2">
        <Alert variant="destructive" className="w-fit max-w-xl">
          <CircleXIcon />
          <AlertTitle>Could not list the tags for this space</AlertTitle>
          <AlertDescription>{`${tagListErrors[0]}`}</AlertDescription>
        </Alert>
      </div>
    )
  }

  if (!tagListResponse) {
    return (
      <div className="mt-4 px-8 py-2">
        <Alert variant="destructive" className="w-fit max-w-xl">
          <CircleXIcon />
          <AlertTitle>Could not list the tags for this space</AlertTitle>
          <AlertDescription>{`The tags could not be listed. Try logging out and logging back in.`}</AlertDescription>
        </Alert>
      </div>
    )
  }

  const tags: Tag[] = []
  for (const [_, v] of Object.entries(tagListResponse)) {
    tags.push(v.tag)
  }

  return (
    <>
      <CreateModelModal spaceId={spaceId} />
      <Container>
        <section
          className="relative bg-gray-50 rounded-sm py-5 px-10 border border-gray-200 dark:bg-gray-900 dark:border-gray-800"
          style={{ boxShadow: '3px 3px 10px 0 rgba(0, 0, 0, 0.03)' }}
        >
          {((Number(totalResults) > 0 && !filter) || filter || tagFilter) && (
            <ModelsTable
              orgId={orgId}
              tags={tags}
              models={models}
              spaceId={spaceId}
              page={page!}
              totalPages={totalPages!}
              totalResults={totalResults ?? 0}
              searchFilter={filter}
              tagFilter={tagFilter}
            />
          )}
          {Number(totalResults) <= 0 && !filter && !tagFilter && (
            <ListTablePlaceholder title="Models" description="Define the structure of your data.">
              <ShapesIcon size="3em" className="text-gray-600 mb-2" />
              <p className="text-gray-600 text-center mb-2">No models... yet!</p>
              <OpenModalButton modalId="createModel">
                <CirclePlusIcon />
                <span>Create your first model</span>
              </OpenModalButton>
            </ListTablePlaceholder>
          )}
        </section>
      </Container>
    </>
  )
}

export default ModelsPage
