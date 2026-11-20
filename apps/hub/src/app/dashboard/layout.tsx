import AppShell from '@gruent/hub/components/layouts/AppShell'
import getAccessToken from '@gruent/hub/util/getAccessToken'

export const metadata = {
  title: 'Dashboard | GRUENT',
}

const Layout = async ({ children }) => {
  const accessToken = await getAccessToken()
  if (!accessToken) return null

  return (
    <AppShell>
      <div className="px-8 pt-8 pb-20">{children}</div>
    </AppShell>
  )
}

export default Layout
