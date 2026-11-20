import formatRelativeTime from '@gruent/hub/util/formatRelativeTime'
import { FC } from 'react'

type Props = {
  value: string | Date | null | undefined
  fallback?: string
}

/** A muted relative timestamp ("3 hours ago") with the exact time on hover. */
const RelativeTime: FC<Props> = ({ value, fallback = '—' }) => {
  const relative = formatRelativeTime(value)
  if (!value || !relative) return <span className="text-sm text-muted-foreground">{fallback}</span>

  const date = new Date(value)
  return (
    <time
      className="text-sm whitespace-nowrap text-muted-foreground"
      dateTime={date.toISOString()}
      title={date.toLocaleString()}
    >
      {relative}
    </time>
  )
}

export default RelativeTime
