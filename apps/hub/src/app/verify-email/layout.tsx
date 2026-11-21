import AuthLayout from '@gruent/hub/components/layouts/AuthLayout'

export const metadata = {
  title: 'Verify email | Gruent',
}

const Layout = async ({ children }) => {
  return <AuthLayout>{children}</AuthLayout>
}

export default Layout
