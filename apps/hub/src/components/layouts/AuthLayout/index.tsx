import getAccessToken, { getSession } from '@gruent/hub/util/getAccessToken'
import Image from 'next/image'
import Link from 'next/link'
import { redirect } from 'next/navigation'

/**
 * Shell for signed-out pages (sign in, sign up, email verification, magic link errors): the hub's
 * tinted outer surface with a single centered card, so it matches the signed-in shell.
 */
const AuthLayout = async ({ children }) => {
  const accessToken = await getAccessToken()
  const { userId } = await getSession(accessToken)

  // Redirect to dashboard if user is already logged in
  if (accessToken && userId) redirect('/dashboard')

  return (
    <div className="flex min-h-screen w-full flex-col bg-sidebar text-foreground">
      <header className="flex h-12 shrink-0 items-center px-3">
        <Link
          href="/signin"
          className="flex items-center gap-2 rounded-md px-1.5 py-1 text-sm font-semibold tracking-wide transition hover:bg-sidebar-accent"
        >
          <Image src="/img/logos/app-icon-primary.png" alt="" width={20} height={20} />
          GRUENT
        </Link>
      </header>
      <main className="flex grow items-center justify-center px-4 pt-6 pb-16">
        <div className="w-full max-w-sm">{children}</div>
      </main>
      <footer className="pb-6 text-center text-xs text-muted-foreground">
        <a href="https://gruent.com" className="hover:text-foreground hover:underline">
          gruent.com
        </a>
      </footer>
    </div>
  )
}

export default AuthLayout
