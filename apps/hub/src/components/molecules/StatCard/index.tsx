import { cn } from 'cn'
import type { LucideIcon } from 'lucide-react'
import { FC, ReactNode } from 'react'

type Props = {
  label: string
  /** `null` renders the metric as unavailable rather than as zero. */
  value: number | null
  icon: LucideIcon
  /** Colors only the icon; the value and labels always use text colors. */
  iconClassName?: string
  hint?: ReactNode
  /** Why the value is unavailable, shown when `value` is `null`. */
  unavailableReason?: string
}

const numberFormat = new Intl.NumberFormat('en')

const StatCard: FC<Props> = ({
  label,
  value,
  icon: Icon,
  iconClassName,
  hint,
  unavailableReason,
}) => {
  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className={cn('size-4', iconClassName)} aria-hidden />
        <span>{label}</span>
      </div>
      {value === null ? (
        <div>
          <div className="text-2xl font-semibold text-muted-foreground" aria-label="Unavailable">
            —
          </div>
          <p className="text-xs text-muted-foreground" title={unavailableReason}>
            Unavailable{unavailableReason ? `: ${unavailableReason}` : ''}
          </p>
        </div>
      ) : (
        <div>
          <div className="text-2xl font-semibold">{numberFormat.format(value)}</div>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
      )}
    </div>
  )
}

export default StatCard
