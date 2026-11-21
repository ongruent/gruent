import FeedbackButton from '@gruent/hub/components/molecules/FeedbackButton'
import getAccessToken from '@gruent/hub/util/getAccessToken'

export const metadata = {
  title: 'Channels | Gruent',
}

/**
 * Full-screen chrome for the channel editor. Unlike `AppShell` there is no section sidebar: the editor's own
 * topbar (see `edit/client.tsx`) leads back to the space and home, and the canvas gets the full width.
 */
const Layout = async ({ children }) => {
  const accessToken = await getAccessToken()
  if (!accessToken) return null

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-sidebar text-foreground">
      <FeedbackButton />
      {children}
    </div>
  )
}

export default Layout
