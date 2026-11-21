const units: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 60 * 60],
  ['month', 30 * 24 * 60 * 60],
  ['week', 7 * 24 * 60 * 60],
  ['day', 24 * 60 * 60],
  ['hour', 60 * 60],
  ['minute', 60],
]

const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

/** Formats a timestamp relative to now, e.g. "3 hours ago". Returns `undefined` for missing or invalid dates. */
const formatRelativeTime = (value: string | Date | null | undefined, now = Date.now()) => {
  if (!value) return undefined
  const time = new Date(value).getTime()
  if (Number.isNaN(time)) return undefined

  const seconds = Math.round((time - now) / 1000)
  for (const [unit, unitSeconds] of units) {
    if (Math.abs(seconds) >= unitSeconds)
      return formatter.format(Math.round(seconds / unitSeconds), unit)
  }
  return 'just now'
}

export default formatRelativeTime
