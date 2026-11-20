import SpaceSelectDropdown from '@gruent/hub/components/organisms/SpaceSelectDropdown'
import gruentClient from '@gruent/hub/lib/gruent'
import getAccessToken from '@gruent/hub/util/getAccessToken'
import Link from 'next/link'
import { FC, PropsWithChildren } from 'react'
import AppShell from '.'
import SpaceSidebar from './SpaceSidebar'
import { BreadcrumbSeparator } from './Topbar'

type Props = {
  orgId: string
  spaceId: string
}

/** `AppShell` for the pages of a space: organization / space switcher and the space sidebar. */
const SpaceShell: FC<PropsWithChildren<Props>> = async ({ orgId, spaceId, children }) => {
  const accessToken = await getAccessToken()
  if (!accessToken) return null

  const { data: space } = await gruentClient(accessToken).spaces.get(orgId, spaceId)
  const { data: organization } = await gruentClient(accessToken).organizations.get(
    space?.organizationId ?? orgId,
  )

  return (
    <AppShell
      sidebar={<SpaceSidebar orgId={orgId} spaceId={spaceId} />}
      breadcrumbs={
        <>
          <Link
            href={`/organizations/${orgId}`}
            className="truncate rounded-md px-2 py-1 text-muted-foreground transition hover:bg-sidebar-accent hover:text-foreground"
          >
            {organization?.name ?? 'Organization'}
          </Link>
          <BreadcrumbSeparator />
          <SpaceSelectDropdown organization={organization ?? undefined} currentSpaceId={spaceId} />
        </>
      }
    >
      {children}
    </AppShell>
  )
}

export default SpaceShell
