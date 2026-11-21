import CreateConnectionModal from '@gruent/hub/components/modals/CreateConnectionModal'
import ListTablePlaceholder from '@gruent/hub/components/molecules/ListTablePlaceholder'
import PageHeader, { PageContent } from '@gruent/hub/components/molecules/PageHeader'
import ConnectionsTable from '@gruent/hub/components/organisms/ConnectionsTable'
import gruentClient from '@gruent/hub/lib/gruent'
import getAccessToken from '@gruent/hub/util/getAccessToken'
import { Alert, AlertDescription, AlertTitle } from '@gruent/libs/frontend/components/core/alert'
import OpenModalButton from '@gruent/libs/frontend/components/OpenModalButton'
import { Tag } from '@prisma/client'
import { CirclePlusIcon, CircleXIcon, WaypointsIcon } from 'lucide-react'

export const metadata = {
  title: 'Connections | Gruent',
}

const ConnectionsPage = async ({ params, searchParams }) => {
  const { orgId, spaceId } = await params
  const { page: requestedPage = 1, q: filter, tagFilter: tagFilterString } = await searchParams

  const tagFilter = tagFilterString ? tagFilterString.split(',') : undefined

  const accessToken = await getAccessToken()
  if (!accessToken) return null

  const {
    data: connections,
    errors: connectionListErrors,
    page,
    totalPages,
    totalResults,
  } = await gruentClient(accessToken).connections.list(spaceId, {
    page: requestedPage,
    filter,
    tagFilter,
  })

  if (connectionListErrors && connectionListErrors.length > 0) {
    return (
      <div>
        <Alert variant="destructive" className="w-fit max-w-xl">
          <CircleXIcon />
          <AlertTitle>Could not list the connections for this space</AlertTitle>
          <AlertDescription>{`${connectionListErrors[0]}`}</AlertDescription>
        </Alert>
      </div>
    )
  }

  if (!connections) {
    return (
      <div>
        <Alert variant="destructive" className="w-fit max-w-xl">
          <CircleXIcon />
          <AlertTitle>Could not list the connections for this space</AlertTitle>
          <AlertDescription>{`The connections could not be listed. Try logging out and logging back in.`}</AlertDescription>
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
      <CreateConnectionModal orgId={orgId} spaceId={spaceId} />
      <PageHeader
        icon={WaypointsIcon}
        title="Connections"
        description="Devices, APIs, databases, message queues - anything you need to connect."
      />
      {!isEmpty && (
        <ConnectionsTable
          tags={tags ?? []}
          searchFilter={filter}
          tagFilter={tagFilter}
          orgId={orgId}
          connections={connections}
          spaceId={spaceId}
          page={page!}
          totalPages={totalPages!}
          totalResults={totalResults ?? 0}
        />
      )}
      {isEmpty && (
        <ListTablePlaceholder
          hideTitle
          title="Connections"
          description="Devices, APIs, databases, message queues - anything you need to connect."
        >
          <WaypointsIcon className="mb-2 size-10 text-muted-foreground" />
          <p className="mb-2 text-center text-muted-foreground">No connections... yet!</p>
          <OpenModalButton modalId="createConnection">
            <CirclePlusIcon />
            <span>Create your first connection</span>
          </OpenModalButton>
        </ListTablePlaceholder>
      )}
    </PageContent>
  )
}

export default ConnectionsPage
