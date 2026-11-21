import AppShell from '@gruent/hub/components/layouts/AppShell'
import getAccessToken, { getSession } from '@gruent/hub/util/getAccessToken'

export const metadata = {
  title: 'Profile | Gruent',
}

const Layout = async ({ children }) => {
  const accessToken = await getAccessToken()
  const { userId } = await getSession(accessToken)
  if (!accessToken || !userId) return null

  return (
    <AppShell>
      <div className="px-8 pt-4 pb-20">{children}</div>
    </AppShell>
  )
}

export default Layout
