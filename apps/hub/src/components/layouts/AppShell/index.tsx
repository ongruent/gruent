import FeedbackButton from '@gruent/hub/components/molecules/FeedbackButton'
import getAccessToken, { getSession } from '@gruent/hub/util/getAccessToken'
import { cn } from 'cn'
import { FC, PropsWithChildren, ReactNode } from 'react'
import Topbar from './Topbar'

type Props = {
  /** Context shown next to the logo, e.g. the organization and space switchers. */
  breadcrumbs?: ReactNode
  /** Section navigation, e.g. `SpaceSidebar`. Pages without one get the full width. */
  sidebar?: ReactNode
}

/**
 * The signed-in hub chrome: a global topbar (logo, context, Home, profile), an optional sidebar and an
 * inset content surface. Chrome sits on the subtle `sidebar` surface, content on `background`.
 */
const AppShell: FC<PropsWithChildren<Props>> = async ({ breadcrumbs, sidebar, children }) => {
  const accessToken = await getAccessToken()
  const { userId } = await getSession(accessToken)

  return (
    <div className="flex h-screen flex-col bg-sidebar text-foreground">
      <FeedbackButton />
      <Topbar userId={userId} breadcrumbs={breadcrumbs} />
      <div className="flex min-h-0 grow">
        {sidebar}
        <main
          className={cn(
            'min-w-0 grow overflow-y-auto border-t border-sidebar-border bg-background',
            sidebar && 'rounded-tl-xl border-l',
          )}
        >
          {children}
        </main>
      </div>
    </div>
  )
}

export default AppShell
