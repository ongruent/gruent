import { cn } from 'cn'
import { FC, ReactNode } from 'react'

type Props = {
  title?: ReactNode
  description?: ReactNode
  actions?: ReactNode
  className?: string
  children: ReactNode
}

/** A bordered content surface with an optional header row. */
const Panel: FC<Props> = ({ title, description, actions, className, children }) => {
  return (
    <section className={cn('rounded-lg border bg-card', className)}>
      {(title || actions) && (
        <div className="flex items-center gap-4 border-b px-4 py-3">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold">{title}</h2>}
            {description && <p className="text-xs text-muted-foreground">{description}</p>}
          </div>
          <div className="grow" />
          {actions}
        </div>
      )}
      {children}
    </section>
  )
}

export default Panel
