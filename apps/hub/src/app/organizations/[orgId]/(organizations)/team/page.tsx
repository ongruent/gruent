import CreateMemberModal from '@gruent/hub/components/modals/CreateMemberModal'
import gruentClient from '@gruent/hub/lib/gruent'
import CreatePermissionSetModal from '@gruent/hub/components/modals/CreatePermissionSetModal'
import CreateApiKeyModal from '@gruent/hub/components/modals/CreateApiKeyModal'
import MembersTable from '@gruent/hub/components/organisms/MembersTable'
import PermissionSetTable from '@gruent/hub/components/organisms/PermissionSetTable'
import ApiKeysTable from '@gruent/hub/components/organisms/ApiKeyTable'
import getAccessToken from '@gruent/hub/util/getAccessToken'
import SearchBar from '@gruent/hub/components/molecules/SearchBar'
import { CirclePlusIcon, CircleXIcon, SquareTerminalIcon } from 'lucide-react'
import OpenModalButton from '@gruent/libs/frontend/components/OpenModalButton'
import Container from '@gruent/libs/frontend/components/Container'
import ListTablePlaceholder from '@gruent/hub/components/molecules/ListTablePlaceholder'
import { Alert, AlertDescription, AlertTitle } from '@gruent/libs/frontend/components/core/alert'
export const metadata = {
  title: 'Team | GRUENT',
}

const OrganizationTeamPage = async ({ params, searchParams }) => {
  const { orgId } = await params
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
    errors: listMembersErrors,
    page: membersPage,
    totalPages: membersTotalPages,
    totalResults: totalMembers,
  } = await gruentClient(accessToken).organizations.members.list(orgId, {
    page: requestedMembersTablePage,
    filter: membersTableFilter,
  })

  if (listMembersErrors && listMembersErrors.length > 0) {
    return (
      <div className="mt-4 px-8 py-2">
        <Alert variant="destructive" className="w-fit max-w-xl">
          <CircleXIcon />
          <AlertTitle>Could not list the members for this organization</AlertTitle>
          <AlertDescription>{`${listMembersErrors[0]}`}</AlertDescription>
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
  } = await gruentClient(accessToken).permissions.list(orgId, {
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

  // Get API keys
  const {
    data: apiKeys,
    errors: listApiKeysErrors,
    page: apiKeysPage,
    totalPages: apiKeysTotalPages,
    totalResults: totalApiKeys,
  } = await gruentClient(accessToken).apiKeys.list(orgId, {
    page: requestedApiKeysTablePage,
  })

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

  return (
    <>
      <CreateMemberModal orgId={orgId} />
      <CreatePermissionSetModal orgId={orgId} />
      <CreateApiKeyModal orgId={orgId} permissionSets={permissionSets ?? []} />
      <Container className="mb-4">
        <section
          className="relative bg-gray-50 rounded-sm py-5 px-10 border border-gray-200 dark:bg-gray-900 dark:border-gray-800"
          style={{ boxShadow: '3px 3px 10px rgba(0,0,0,.03)' }}
        >
          <div className="absolute top-8 right-10 mb-1 flex items-end gap-2">
            <div className="grow" />
            <SearchBar
              paramKey="mq"
              initialFilter={membersTableFilter}
              placeholder="Search members"
            />
            <OpenModalButton variant="outline" modalId="addMember">
              <CirclePlusIcon />
              <span>Add</span>
            </OpenModalButton>
          </div>
          <MembersTable
            orgId={orgId}
            users={users ?? []}
            permissionSets={permissionSets ?? []}
            page={membersPage!}
            totalPages={membersTotalPages!}
            totalResults={totalMembers ?? 0}
          />
        </section>
      </Container>
      <Container className="mb-4">
        <section
          className="relative bg-gray-50 rounded-sm py-5 px-10 border border-gray-200 dark:bg-gray-900 dark:border-gray-800"
          style={{ boxShadow: '3px 3px 10px rgba(0,0,0,.03)' }}
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
                apiKeys={apiKeys ?? []}
                permissionSets={permissionSets ?? []}
                page={apiKeysPage!}
                totalPages={apiKeysTotalPages!}
                totalResults={totalApiKeys ?? 1}
              />
            </>
          )}
          {Number(totalApiKeys) <= 0 && (
            <ListTablePlaceholder
              title="API Keys"
              description="Programmatically access the GRUENT platform."
            >
              <SquareTerminalIcon size="3em" className="text-gray-600 dark:text-gray-200 mb-2" />
              <p className="text-gray-600 dark:text-gray-400 text-center mb-2">
                No API keys... yet!
              </p>
              <OpenModalButton modalId="addApiKey">
                <CirclePlusIcon />
                <span>Create your first API key</span>
              </OpenModalButton>
            </ListTablePlaceholder>
          )}
        </section>
      </Container>
      <Container>
        <section
          className="relative bg-gray-50 rounded-sm py-5 px-10 border border-gray-200 dark:bg-gray-900 dark:border-gray-800"
          style={{ boxShadow: '3px 3px 10px rgba(0,0,0,.03)' }}
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
            permissionSets={permissionSets ?? []}
            page={permissionSetsPage!}
            totalPages={permissionSetsTotalPages!}
            totalResults={totalPermissionSets ?? 0}
          />
        </section>
      </Container>
    </>
  )
}

export default OrganizationTeamPage
