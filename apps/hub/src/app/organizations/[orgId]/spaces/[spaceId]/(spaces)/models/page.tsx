import CreateModelModal from '@gruent/hub/components/modals/CreateModelModal'
import ListTablePlaceholder from '@gruent/hub/components/molecules/ListTablePlaceholder'
import PageHeader, { PageContent } from '@gruent/hub/components/molecules/PageHeader'
import ModelsTable from '@gruent/hub/components/organisms/ModelsTable'
import gruentClient from '@gruent/hub/lib/gruent'
import getAccessToken from '@gruent/hub/util/getAccessToken'
import { Alert, AlertDescription, AlertTitle } from '@gruent/libs/frontend/components/core/alert'
import OpenModalButton from '@gruent/libs/frontend/components/OpenModalButton'
import { Tag } from '@prisma/client'
import { CirclePlusIcon, CircleXIcon, ShapesIcon } from 'lucide-react'

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
      <div>
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
      <div>
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
      <div>
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
      <div>
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

  const isEmpty = Number(totalResults) <= 0 && !filter && !tagFilter

  return (
    <PageContent>
      <CreateModelModal spaceId={spaceId} />
      <PageHeader
        icon={ShapesIcon}
        title="Models"
        description="Define the structure of your data."
      />
      {!isEmpty && (
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
      {isEmpty && (
        <ListTablePlaceholder
          hideTitle
          title="Models"
          description="Define the structure of your data."
        >
          <ShapesIcon className="mb-2 size-10 text-muted-foreground" />
          <p className="mb-2 text-center text-muted-foreground">No models... yet!</p>
          <OpenModalButton modalId="createModel">
            <CirclePlusIcon />
            <span>Create your first model</span>
          </OpenModalButton>
        </ListTablePlaceholder>
      )}
    </PageContent>
  )
}

export default ModelsPage
