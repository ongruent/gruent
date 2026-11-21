import { cn } from 'cn'
import { FC } from 'react'

type Props = {
  /** Live controller status, or `null` if it could not be read. */
  status: 'PUBLISHED' | 'UNPUBLISHED' | 'INITIALIZING' | null
}

const variants = {
  PUBLISHED: { label: 'Deployed', dot: 'bg-green-500' },
  INITIALIZING: { label: 'Initializing', dot: 'bg-yellow-500 animate-pulse' },
  UNPUBLISHED: { label: 'Not deployed', dot: 'bg-gray-300 dark:bg-gray-600' },
  UNKNOWN: { label: 'Unknown', dot: 'border border-gray-400 dark:border-gray-500' },
}

const DeploymentStatusBadge: FC<Props> = ({ status }) => {
  const variant = variants[status ?? 'UNKNOWN']

  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
      <span aria-hidden className={cn('size-2 rounded-full', variant.dot)} />
      {variant.label}
    </span>
  )
}

export default DeploymentStatusBadge
