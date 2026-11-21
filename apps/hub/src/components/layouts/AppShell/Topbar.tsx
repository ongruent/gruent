import { Button } from '@gruent/libs/frontend/components/core/button'
import { HouseIcon } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { FC, ReactNode } from 'react'
import UserMenu from './UserMenu'

type Props = {
  userId: string | null
  breadcrumbs?: ReactNode
}

const Topbar: FC<Props> = ({ userId, breadcrumbs }) => {
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 px-3">
      <Link
        href="/dashboard"
        aria-label="Gruent home"
        className="flex size-8 shrink-0 items-center justify-center rounded-md transition hover:bg-sidebar-accent"
      >
        <Image src="/img/logos/app-icon-primary.png" alt="Gruent logo" width={20} height={20} />
      </Link>
      {breadcrumbs && (
        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-0.5 text-sm">
          {breadcrumbs}
        </nav>
      )}
      <div className="grow" />
      <Button variant="ghost" size="sm" className="text-muted-foreground" asChild>
        <Link href="/dashboard">
          <HouseIcon />
          <span>Home</span>
        </Link>
      </Button>
      {userId && <UserMenu userId={userId} />}
    </header>
  )
}

export const BreadcrumbSeparator = () => (
  <span aria-hidden className="px-0.5 text-muted-foreground/60">
    /
  </span>
)

export default Topbar
