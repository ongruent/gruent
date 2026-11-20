'use client'

import { CogIcon, LayersIcon, ShieldUserIcon } from 'lucide-react'
import { FC } from 'react'
import Sidebar from './Sidebar'

type Props = {
  orgId: string
}

const OrganizationSidebar: FC<Props> = ({ orgId }) => {
  const base = `/organizations/${orgId}`

  return (
    <Sidebar
      id="organizationNavbar"
      label="Organization"
      sections={[
        {
          items: [{ id: 'orgSpaces', href: base, label: 'Spaces', icon: LayersIcon, exact: true }],
        },
        {
          label: 'Manage',
          items: [
            { id: 'orgTeam', href: `${base}/team`, label: 'Team', icon: ShieldUserIcon },
            { id: 'orgSettings', href: `${base}/settings`, label: 'Settings', icon: CogIcon },
          ],
        },
      ]}
    />
  )
}

export default OrganizationSidebar
