import SpaceShell from '@gruent/hub/components/layouts/AppShell/SpaceShell'

export const metadata = {
  title: 'Space dashboard | Gruent',
}

const Layout = async ({ children, params }) => {
  const { orgId, spaceId } = await params

  return (
    <SpaceShell orgId={orgId} spaceId={spaceId}>
      <div className="px-8 pt-8 pb-20">{children}</div>
    </SpaceShell>
  )
}

export default Layout
