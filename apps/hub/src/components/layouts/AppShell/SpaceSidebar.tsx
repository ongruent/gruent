'use client'

import {
  CogIcon,
  GitForkIcon,
  KeyRoundIcon,
  LayoutDashboardIcon,
  ShapesIcon,
  ShieldUserIcon,
  WaypointsIcon,
} from 'lucide-react'
import { FC } from 'react'
import Sidebar from './Sidebar'

type Props = {
  orgId: string
  spaceId: string
}

const SpaceSidebar: FC<Props> = ({ orgId, spaceId }) => {
  const base = `/organizations/${orgId}/spaces/${spaceId}`

  return (
    <Sidebar
      id="spacesNavbar"
      label="Space"
      sections={[
        {
          items: [
            {
              id: 'spaceHome',
              href: base,
              label: 'Overview',
              icon: LayoutDashboardIcon,
              exact: true,
            },
          ],
        },
        {
          label: 'Build',
          items: [
            { id: 'spaceChannels', href: `${base}/channels`, label: 'Channels', icon: GitForkIcon },
            {
              id: 'spaceConnections',
              href: `${base}/connections`,
              label: 'Connections',
              icon: WaypointsIcon,
            },
            { id: 'spaceModels', href: `${base}/models`, label: 'Models', icon: ShapesIcon },
            { id: 'spaceSecrets', href: `${base}/secrets`, label: 'Secrets', icon: KeyRoundIcon },
          ],
        },
        {
          label: 'Manage',
          items: [
            { id: 'spaceTeam', href: `${base}/team`, label: 'Team', icon: ShieldUserIcon },
            { id: 'spaceSettings', href: `${base}/settings`, label: 'Settings', icon: CogIcon },
          ],
        },
      ]}
    />
  )
}

export default SpaceSidebar
