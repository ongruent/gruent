import AppShell from '@gruent/hub/components/layouts/AppShell'
import OrganizationSidebar from '@gruent/hub/components/layouts/AppShell/OrganizationSidebar'
import OrgSelectDropdown from '@gruent/hub/components/organisms/OrgSelectDropdown'
import gruentClient from '@gruent/hub/lib/gruent'
import getAccessToken, { getSession } from '@gruent/hub/util/getAccessToken'

export const metadata = {
  title: 'Organization dashboard | GRUENT',
}

const Layout = async ({ children, params }) => {
  const accessToken = await getAccessToken()
  const { userId } = await getSession(accessToken)
  if (!accessToken || !userId) return null

  const { orgId } = await params

  const { data: user, errors: _getUserErrors } = await gruentClient(accessToken).users.get(userId)

  const organizations = user?.organizations.map((orgMembership) => orgMembership.organization)
  const organization = organizations?.find((org) => org.id === orgId)

  return (
    <AppShell
      sidebar={<OrganizationSidebar orgId={orgId} />}
      breadcrumbs={
        <OrgSelectDropdown organizations={organizations ?? []} currentOrg={organization} />
      }
    >
      <div className="px-8 pt-8 pb-20">{children}</div>
    </AppShell>
  )
}

export default Layout
