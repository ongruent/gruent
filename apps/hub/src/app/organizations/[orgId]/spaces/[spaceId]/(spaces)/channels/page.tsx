import CreateChannelModal from '@gruent/hub/components/modals/CreateChannelModal'
import ErrorAlert from '@gruent/hub/components/molecules/ErrorAlert'
import ListTablePlaceholder from '@gruent/hub/components/molecules/ListTablePlaceholder'
import PageHeader, { PageContent } from '@gruent/hub/components/molecules/PageHeader'
import ChannelsTable from '@gruent/hub/components/organisms/ChannelsTable'
import gruentClient from '@gruent/hub/lib/gruent'
import getAccessToken from '@gruent/hub/util/getAccessToken'
import OpenModalButton from '@gruent/libs/frontend/components/OpenModalButton'
import { Tag } from '@prisma/client'
import { CirclePlusIcon, GitForkIcon } from 'lucide-react'

export const metadata = {
  title: 'Channels | GRUENT',
}

const ChannelsPage = async ({ params, searchParams }) => {
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
      <ErrorAlert title="Could not list the channels for this space" description={`${errors[0]}`} />
    )
  }

  if (!channels) {
    return (
      <ErrorAlert
        title="Could not list the channels for this space"
        description="The channels could not be listed. Try logging out and logging back in."
      />
    )
  }

  const { data: tagListResponse, errors: tagListErrors } =
    await gruentClient(accessToken).tags.list(spaceId)

  if (tagListErrors && tagListErrors.length > 0) {
    return (
      <ErrorAlert
        title="Could not list the tags for this space"
        description={`${tagListErrors[0]}`}
      />
    )
  }

  if (!tagListResponse) {
    return (
      <ErrorAlert
        title="Could not list the tags for this space"
        description="The tags could not be listed. Try logging out and logging back in."
      />
    )
  }

  const tags: Tag[] = []
  for (const [_, v] of Object.entries(tagListResponse)) {
    tags.push(v.tag)
  }

  const isEmpty = Number(totalResults) <= 0 && !filter && !tagFilter

  return (
    <PageContent>
      <CreateChannelModal spaceId={spaceId} />
      <PageHeader
        icon={GitForkIcon}
        title="Channels"
        description="Build connections to power your ideas. Open a channel to see its executions."
      />
      {!isEmpty && (
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
      {isEmpty && (
        <ListTablePlaceholder
          hideTitle
          title="Channels"
          description="Build connections to power your ideas."
        >
          <GitForkIcon className="mb-2 size-10 rotate-180 text-muted-foreground" />
          <p className="mb-2 text-center text-muted-foreground">No channels... yet!</p>
          <OpenModalButton modalId="createChannel">
            <CirclePlusIcon />
            <span>Create your first channel</span>
          </OpenModalButton>
        </ListTablePlaceholder>
      )}
    </PageContent>
  )
}

export default ChannelsPage
