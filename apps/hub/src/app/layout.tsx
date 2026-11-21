import { Toaster } from '@gruent/libs/frontend/components/core/sonner'
import './styles.css'
import SettingsLoader from '@gruent/hub/components/templates/SettingsLoader'
import Providers from '@gruent/hub/contexts/Providers'
import { cookies } from 'next/headers'
export const dynamic = 'force-dynamic'

// Applies the saved theme before the first paint, so dark mode doesn't flash light on load.
const themeScript = `try{var t=JSON.parse(localStorage.getItem('settings')||'{}').theme;if(t==='dark'){document.documentElement.setAttribute('data-theme','dark');document.documentElement.style.colorScheme='dark'}}catch(e){}`

export const metadata = {
  title: 'Hub | Gruent',
}

const RootLayout = async ({ children }: { children: React.ReactNode }) => {
  const cookieStore = await cookies()
  const accessToken = cookieStore.get('access_token')?.value

  return (
    <html suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <div className="flex flex-col min-h-screen">
          <Providers accessToken={accessToken ?? null}>
            <Toaster
              position="bottom-right"
              closeButton
              toastOptions={{ classNames: { toast: 'toastNotification' } }}
            />
            <SettingsLoader />
            {children}
          </Providers>
        </div>
      </body>
    </html>
  )
}

export default RootLayout
