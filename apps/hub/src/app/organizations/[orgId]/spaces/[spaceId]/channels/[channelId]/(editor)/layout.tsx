import Image from 'next/image'
import Link from 'next/link'
import {
  CogIcon,
  HouseIcon,
  KeyRoundIcon,
  WaypointsIcon,
  ShapesIcon,
  ShieldUserIcon,
} from 'lucide-react'
import styles from './layout.module.css'
import getAccessToken from '@gruent/hub/util/getAccessToken'
import FeedbackButton from '@gruent/hub/components/molecules/FeedbackButton'

export const metadata = {
  title: 'Channels | Gruent',
}

const Layout = async ({ children, params }) => {
  const { orgId, spaceId } = await params

  const accessToken = await getAccessToken()
  if (!accessToken) return null

  return (
    <>
      <div className="flex grow">
        <FeedbackButton />
        <aside
          id="spacesNavbar"
          className="px-5 py-4 border-r border-gray-200 dark:border-gray-800"
        >
          <nav>
            <Link href={`/dashboard`}>
              <Image
                src="/img/logos/app-icon-primary.png"
                alt="Gruent logo"
                width={25}
                height={25}
              />
            </Link>
            <ul className="flex flex-col gap-4 mt-4">
              <li id="spaceHome">
                <Link href={`/organizations/${orgId}/spaces/${spaceId}`}>
                  <HouseIcon size="1.5em" className={styles.sidebarLink} />
                </Link>
              </li>
              <li id="spaceConnections">
                <Link href={`/organizations/${orgId}/spaces/${spaceId}/connections`}>
                  <WaypointsIcon size="1.5em" className={styles.sidebarLink} />
                </Link>
              </li>
              <li id="spaceModels">
                <Link href={`/organizations/${orgId}/spaces/${spaceId}/models`}>
                  <ShapesIcon size="1.5em" className={styles.sidebarLink} />
                </Link>
              </li>
              <li id="spaceSecrets">
                <Link href={`/organizations/${orgId}/spaces/${spaceId}/secrets`}>
                  <KeyRoundIcon size="1.5em" className={styles.sidebarLink} />
                </Link>
              </li>
              <hr />
              <li id="spaceTeam">
                <Link href={`/organizations/${orgId}/spaces/${spaceId}/team`}>
                  <ShieldUserIcon size="1.5em" className={styles.sidebarLink} />
                </Link>
              </li>
              <li id="spaceSettings">
                <Link href={`/organizations/${orgId}/spaces/${spaceId}/settings`}>
                  <CogIcon size="1.5em" className={styles.sidebarLink} />
                </Link>
              </li>
            </ul>
          </nav>
        </aside>
        <main className="flex flex-col grow">
          <div className="grow">{children}</div>
        </main>
      </div>
    </>
  )
}

export default Layout
