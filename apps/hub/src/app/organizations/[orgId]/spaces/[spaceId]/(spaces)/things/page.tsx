import gruentClient from '@gruent/hub/lib/gruent'
import CreateThingModal from '@gruent/hub/components/modals/CreateThingModal'
import ThingsTable from '@gruent/hub/components/organisms/ThingsTable'
import getAccessToken from '@gruent/hub/util/getAccessToken'
import OpenModalButton from '@gruent/libs/frontend/components/OpenModalButton'
import { CirclePlusIcon, CircleXIcon, RouterIcon } from 'lucide-react'
import Container from '@gruent/libs/frontend/components/Container'
import ListTablePlaceholder from '@gruent/hub/components/molecules/ListTablePlaceholder'
import { Alert, AlertDescription, AlertTitle } from '@gruent/libs/frontend/components/core/alert'
import { Tag } from '@prisma/client'

export const metadata = {
  title: 'Things | GRUENT',
}

const ThingsPage = async ({ params, searchParams }) => {
  const { orgId, spaceId } = await params
  const { page: requestedPage = 1, q: filter, tagFilter: tagFilterString } = await searchParams

  const tagFilter = tagFilterString ? tagFilterString.split(',') : undefined

  const accessToken = await getAccessToken()
  if (!accessToken) return null

  const {
    data: things,
    errors: thingListErrors,
    page,
    totalPages,
    totalResults,
  } = await gruentClient(accessToken).things.list(spaceId, {
    page: requestedPage,
    filter,
    tagFilter,
  })

  if (thingListErrors && thingListErrors.length > 0) {
    return (
      <div className="mt-4 px-8 py-2">
        <Alert variant="destructive" className="w-fit max-w-xl">
          <CircleXIcon />
          <AlertTitle>Could not list the things for this space</AlertTitle>
          <AlertDescription>{`${thingListErrors[0]}`}</AlertDescription>
        </Alert>
      </div>
    )
  }

  if (!things) {
    return (
      <div className="mt-4 px-8 py-2">
        <Alert variant="destructive" className="w-fit max-w-xl">
          <CircleXIcon />
          <AlertTitle>Could not list the things for this space</AlertTitle>
          <AlertDescription>{`The things could not be listed. Try logging out and logging back in.`}</AlertDescription>
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
      <CreateThingModal orgId={orgId} spaceId={spaceId} />
      <Container>
        <section className="relative bg-gray-50 rounded-sm py-5 px-10 border border-gray-200 dark:bg-gray-900 dark:border-gray-800">
          {((Number(totalResults) > 0 && !filter) || filter || tagFilter) && (
            <ThingsTable
              tags={tags ?? []}
              searchFilter={filter}
              tagFilter={tagFilter}
              orgId={orgId}
              things={things}
              spaceId={spaceId}
              page={page!}
              totalPages={totalPages!}
              totalResults={totalResults ?? 0}
            />
          )}
          {Number(totalResults) <= 0 && !filter && !tagFilter && (
            <ListTablePlaceholder
              title="Things"
              description="Devices, APIs, databases, message queues - anything you need to connect."
            >
              <RouterIcon size="3em" className="text-gray-600 mb-2" />
              <p className="text-gray-600 text-center mb-2">No things... yet!</p>
              <OpenModalButton modalId="createThing">
                <CirclePlusIcon />
                <span>Create your first thing</span>
              </OpenModalButton>
            </ListTablePlaceholder>
          )}
        </section>
      </Container>
    </>
  )
}

export default ThingsPage
