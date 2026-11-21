import { cn } from 'cn'
import type { LucideIcon } from 'lucide-react'
import { FC, PropsWithChildren, ReactNode } from 'react'

type Props = {
  title: string
  description?: ReactNode
  /** Status icon shown above the title, for states such as "link sent" or "link expired". */
  icon?: LucideIcon
  iconClassName?: string
  /** Shown below the card, e.g. "No account? Sign up". */
  footer?: ReactNode
  className?: string
}

/** Card used by signed-out pages. Renders inside `AuthLayout`. */
const AuthCard: FC<PropsWithChildren<Props>> = ({
  title,
  description,
  icon: Icon,
  iconClassName,
  footer,
  className,
  children,
}) => (
  <div className="flex flex-col gap-4">
    <section
      className={cn(
        'flex flex-col gap-6 rounded-xl border bg-card p-8 text-card-foreground shadow-sm',
        className,
      )}
    >
      <div className="flex flex-col gap-1.5">
        {Icon && (
          <div className="mb-3 flex size-10 items-center justify-center rounded-lg border bg-muted/50">
            <Icon className={cn('size-5 text-muted-foreground', iconClassName)} />
          </div>
        )}
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description && <div className="text-sm text-muted-foreground">{description}</div>}
      </div>
      {children}
    </section>
    {footer && <div className="text-center text-sm text-muted-foreground">{footer}</div>}
  </div>
)

export default AuthCard
