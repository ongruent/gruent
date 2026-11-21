import gruentClient from '@gruent/hub/lib/gruent'
import CreatePermissionSetModal from '@gruent/hub/components/modals/CreatePermissionSetModal'
import MembersTable from '@gruent/hub/components/organisms/MembersTable'
import ApiKeysTable from '@gruent/hub/components/organisms/ApiKeyTable'
import getAccessToken from '@gruent/hub/util/getAccessToken'
import PermissionSetTable from '@gruent/hub/components/organisms/PermissionSetTable'
import SearchBar from '@gruent/hub/components/molecules/SearchBar'
import Container from '@gruent/libs/frontend/components/Container'
import CreateApiKeyModal from '@gruent/hub/components/modals/CreateApiKeyModal'
import { CirclePlusIcon, CircleXIcon, SquareTerminalIcon } from 'lucide-react'
import OpenModalButton from '@gruent/libs/frontend/components/OpenModalButton'
import ListTablePlaceholder from '@gruent/hub/components/molecules/ListTablePlaceholder'
import { Alert, AlertDescription, AlertTitle } from '@gruent/libs/frontend/components/core/alert'

export const metadata = {
  title: 'Team | Gruent',
}

const TeamPage = async ({ params, searchParams }) => {
  const { orgId, spaceId } = await params
  const {
    membersTablePage: requestedMembersTablePage = 1,
    apiKeysTablePage: requestedApiKeysTablePage = 1,
    permissionsTablePage: requestedPermissionsTablePage = 1,
    mq: membersTableFilter = '',
  } = await searchParams

  const accessToken = await getAccessToken()
  if (!accessToken) return null

  // Get members
  const {
    data: users,
    errors: listUsersErrors,
    page: membersPage,
    totalPages: membersTotalPages,
    totalResults: totalMembers,
  } = await gruentClient(accessToken).organizations.members.list(orgId, {
    page: requestedMembersTablePage,
    filter: membersTableFilter,
  })

  if (listUsersErrors && listUsersErrors.length > 0) {
    return (
      <div className="mt-4 px-8 py-2">
        <Alert variant="destructive" className="w-fit max-w-xl">
          <CircleXIcon />
          <AlertTitle>Could not list the members for this space</AlertTitle>
          <AlertDescription>{`${listUsersErrors[0]}`}</AlertDescription>
        </Alert>
      </div>
    )
  }

  if (!users) {
    return (
      <div className="mt-4 px-8 py-2">
        <Alert variant="destructive" className="w-fit max-w-xl">
          <CircleXIcon />
          <AlertTitle>Could not get the channels for this space</AlertTitle>
          <AlertDescription>{`The channels could not be retrieved. Try logging out and logging back in.`}</AlertDescription>
        </Alert>
      </div>
    )
  }

  // Get permission sets
  const {
    data: permissionSets,
    errors: listPermissionSetsErrors,
    page: permissionSetsPage,
    totalPages: permissionSetsTotalPages,
    totalResults: totalPermissionSets,
  } = await gruentClient(accessToken).permissions.list(spaceId, {
    page: requestedPermissionsTablePage,
  })

  if (listPermissionSetsErrors && listPermissionSetsErrors.length > 0) {
    return (
      <div className="mt-4 px-8 py-2">
        <Alert variant="destructive" className="w-fit max-w-xl">
          <CircleXIcon />
          <AlertTitle>Could not list the permission sets for this space</AlertTitle>
          <AlertDescription>{`${listPermissionSetsErrors[0]}`}</AlertDescription>
        </Alert>
      </div>
    )
  }

  if (!permissionSets) {
    return (
      <div className="mt-4 px-8 py-2">
        <Alert variant="destructive" className="w-fit max-w-xl">
          <CircleXIcon />
          <AlertTitle>Could not get the permission sets for this space</AlertTitle>
          <AlertDescription>{`The permission sets could not be retrieved. Try logging out and logging back in.`}</AlertDescription>
        </Alert>
      </div>
    )
  }

  // Get API keys
  const {
    data: apiKeys,
    errors: listApiKeysErrors,
    page: apiKeysPage,
    totalPages: apiKeysTotalPages,
    totalResults: totalApiKeys,
  } = await gruentClient(accessToken).apiKeys.list(
    orgId,
    {
      page: requestedApiKeysTablePage,
    },
    spaceId,
  )

  if (listApiKeysErrors && listApiKeysErrors.length > 0) {
    return (
      <div className="mt-4 px-8 py-2">
        <Alert variant="destructive" className="w-fit max-w-xl">
          <CircleXIcon />
          <AlertTitle>Could not list the API keys for this space</AlertTitle>
          <AlertDescription>{`${listApiKeysErrors[0]}`}</AlertDescription>
        </Alert>
      </div>
    )
  }

  if (!apiKeys) {
    return (
      <div className="mt-4 px-8 py-2">
        <Alert variant="destructive" className="w-fit max-w-xl">
          <CircleXIcon />
          <AlertTitle>Could not get the API keys for this space</AlertTitle>
          <AlertDescription>{`The API keys could not be retrieved. Try logging out and logging back in.`}</AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <>
      <CreateApiKeyModal orgId={orgId} spaceId={spaceId} permissionSets={permissionSets} />
      <CreatePermissionSetModal orgId={orgId} spaceId={spaceId} />
      <Container className="mb-4">
        <section
          className="relative bg-gray-50 rounded-sm py-5 px-10 border border-gray-200 dark:bg-gray-900 dark:border-gray-800"
          style={{ boxShadow: '3px 3px 10px 0 rgba(0, 0, 0, 0.03)' }}
        >
          <div className="absolute top-8 right-10 mb-1 flex items-end gap-2">
            <div className="grow" />
            <SearchBar
              paramKey="mq"
              initialFilter={membersTableFilter}
              placeholder="Search members"
            />
          </div>
          <MembersTable
            orgId={orgId}
            users={users}
            permissionSets={permissionSets}
            page={membersPage!}
            totalPages={membersTotalPages!}
            totalResults={totalMembers ?? 0}
          />
        </section>
      </Container>
      <Container className="mb-4">
        <section
          className="relative bg-gray-50 rounded-sm py-5 px-10 border border-gray-200 dark:bg-gray-900 dark:border-gray-800"
          style={{ boxShadow: '3px 3px 10px 0 rgba(0, 0, 0, 0.03)' }}
        >
          {Number(totalApiKeys) > 0 && (
            <>
              <div className="absolute top-8 right-10 mb-1 flex items-end gap-2">
                <div className="grow" />
                <OpenModalButton variant="outline" modalId="addApiKey">
                  <CirclePlusIcon />
                  <span>Create</span>
                </OpenModalButton>
              </div>
              <ApiKeysTable
                orgId={orgId}
                spaceId={spaceId}
                apiKeys={apiKeys}
                permissionSets={permissionSets}
                page={apiKeysPage!}
                totalPages={apiKeysTotalPages!}
                totalResults={totalApiKeys ?? 1}
              />
            </>
          )}
          {Number(totalApiKeys) <= 0 && (
            <ListTablePlaceholder
              title="API Keys"
              description="Programmatically access the Gruent platform."
            >
              <SquareTerminalIcon size="3em" className="text-gray-600 mb-2" />
              <p className="text-gray-600 text-center mb-2">No API keys... yet!</p>
              <OpenModalButton modalId="addApiKey">
                <CirclePlusIcon />
                <span>Create your first API key</span>
              </OpenModalButton>
            </ListTablePlaceholder>
          )}
        </section>
      </Container>
      <Container className="mb-4">
        <section
          className="relative bg-gray-50 rounded-sm py-5 px-10 border border-gray-200 dark:bg-gray-900 dark:border-gray-800"
          style={{ boxShadow: '3px 3px 10px 0 rgba(0, 0, 0, 0.03)' }}
        >
          <div className="absolute top-8 right-10 mb-1 flex items-end gap-2">
            <div className="grow" />
            <OpenModalButton variant="outline" modalId="addPermissionSet">
              <CirclePlusIcon />
              <span>Create</span>
            </OpenModalButton>
          </div>
          <PermissionSetTable
            orgId={orgId}
            spaceId={spaceId}
            permissionSets={permissionSets}
            page={permissionSetsPage!}
            totalPages={permissionSetsTotalPages!}
            totalResults={totalPermissionSets ?? 0}
          />
        </section>
      </Container>
    </>
  )
}

export default TeamPage
