import type { LucideIcon } from 'lucide-react'
import { FC, ReactNode } from 'react'

type Props = {
  title: ReactNode
  description?: ReactNode
  icon?: LucideIcon
  /** Primary page actions, aligned right (e.g. a Create button). */
  actions?: ReactNode
}

const PageHeader: FC<Props> = ({ title, description, icon: Icon, actions }) => {
  return (
    <header className="mb-6 flex flex-wrap items-end gap-4">
      <div className="flex min-w-0 items-start gap-3">
        {Icon && (
          <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg border bg-muted/50 text-muted-foreground">
            <Icon className="size-4" />
          </div>
        )}
        <div className="min-w-0">
          <h1 className="truncate text-xl">{title}</h1>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
      </div>
      <div className="grow" />
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  )
}

/** Constrains hub page content to a readable width. The layouts provide the padding. */
export const PageContent: FC<{ children: ReactNode }> = ({ children }) => (
  <div className="mx-auto w-full max-w-6xl">{children}</div>
)

export default PageHeader
