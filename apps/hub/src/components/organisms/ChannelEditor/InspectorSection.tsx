import { cn } from 'cn'
import { FC, ReactNode } from 'react'

type Props = {
  title: ReactNode
  description?: ReactNode
  /** Leading visual, e.g. a step's category icon */
  media?: ReactNode
  actions?: ReactNode
  className?: string
  children?: ReactNode
  'data-testid'?: string
}

/** One section of the editor's right-hand inspector: a header row followed by its content. */
const InspectorSection: FC<Props> = ({
  title,
  description,
  media,
  actions,
  className,
  children,
  'data-testid': testId,
}) => (
  <section className={cn('border-b px-5 py-4', className)} data-testid={testId}>
    <header className={cn('flex items-center gap-3', children && 'mb-4')}>
      {media}
      <div className="min-w-0 grow">
        <h2 className="truncate text-sm font-semibold">{title}</h2>
        {description && <p className="truncate text-xs text-muted-foreground">{description}</p>}
      </div>
      {actions}
    </header>
    {children}
  </section>
)

export default InspectorSection
