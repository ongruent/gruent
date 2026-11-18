import CreateChannelModal from '@gruent/hub/components/modals/CreateChannelModal'
import gruentClient from '@gruent/hub/lib/gruent'
import ChannelsTable from '@gruent/hub/components/organisms/ChannelsTable'
import getAccessToken from '@gruent/hub/util/getAccessToken'
import Container from '@gruent/libs/frontend/components/Container'
import { CirclePlusIcon, CircleXIcon, GitForkIcon } from 'lucide-react'
import OpenModalButton from '@gruent/libs/frontend/components/OpenModalButton'
import ListTablePlaceholder from '@gruent/hub/components/molecules/ListTablePlaceholder'
import { Alert, AlertDescription, AlertTitle } from '@gruent/libs/frontend/components/core/alert'
import { Tag } from '@prisma/client'
const SpaceDashboardPage = async ({ params, searchParams }) => {
  const { orgId, spaceId } = await params
  const { page: requestedPage = 1, q: filter, tagFilter: tagFilterString } = await searchParams

  const tagFilter = tagFilterString ? tagFilterString.split(',') : undefined

  const accessToken = await getAccessToken()
  if (!accessToken) return null

  const {
    data: channels,
    errors,
    page,
    totalPages,
    totalResults,
  } = await gruentClient(accessToken).channels.list(spaceId, {
    page: requestedPage,
    filter,
    tagFilter,
  })

  if (errors && errors.length > 0) {
    return (
      <div className="mt-4 px-8 py-2">
        <Alert variant="destructive" className="w-fit max-w-xl">
          <CircleXIcon />
          <AlertTitle>Could not list the channels for this space</AlertTitle>
          <AlertDescription>{`${errors[0]}`}</AlertDescription>
        </Alert>
      </div>
    )
  }

  if (!channels) {
    return (
      <div className="mt-4 px-8 py-2">
        <Alert variant="destructive" className="w-fit max-w-xl">
          <CircleXIcon />
          <AlertTitle>Channel does not exist</AlertTitle>
          <AlertDescription>{`The channel does not exist. Try logging out and logging back in.`}</AlertDescription>
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
      <CreateChannelModal spaceId={spaceId} />
      <Container>
        <h1 className="text-2xl mb-6">Welcome to your space</h1>
      </Container>
      <Container>
        <section
          className="relative bg-gray-50 rounded-sm py-5 px-10 border border-gray-200 dark:bg-gray-900 dark:border-gray-800"
          style={{ boxShadow: '3px 3px 10px 0 rgba(0, 0, 0, 0.03)' }}
        >
          {((Number(totalResults) > 0 && !filter) || filter || tagFilter) && (
            <ChannelsTable
              channels={channels}
              tags={tags}
              orgId={orgId}
              spaceId={spaceId}
              page={page!}
              totalPages={totalPages!}
              totalResults={totalResults ?? 0}
              searchFilter={filter}
              tagFilter={tagFilter}
            />
          )}
          {Number(totalResults) <= 0 && !filter && !tagFilter && (
            <ListTablePlaceholder
              title="Channels"
              description="Build connections to power your ideas."
            >
              <GitForkIcon size="3em" className="text-gray-600 mb-2 rotate-180" />
              <p className="text-gray-600 text-center mb-2">No channels... yet!</p>
              <OpenModalButton modalId="createChannel">
                <CirclePlusIcon />
                <span>Create your first channel</span>
              </OpenModalButton>
            </ListTablePlaceholder>
          )}
        </section>
      </Container>
    </>
  )
}

export default SpaceDashboardPage
