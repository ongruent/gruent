import { type ExternalToast, toast } from 'sonner'
import isBrowser from '../util/isBrowser'

export type Notification = {
  key: string
  title: string
  body: string
  ttl?: number
  level?: 'info' | 'error' | 'warning' | 'success'
}

/**
 * Dismiss a toast that was previously shown with `addToast`.
 */
export const removeToast = (key: string) => {
  toast.dismiss(key)
}

/**
 * Show a toast notification. Rendered by the shadcn/ui `Toaster` (`components/core/sonner`),
 * which must be mounted once in the app layout.
 *
 * @param ttl - seconds before the toast is dismissed. `0` (or less) keeps it open until dismissed.
 * @returns the toast key, which can be passed to `removeToast`.
 */
export const addToast = ({ title, body, level = 'info', ttl = 5 }: Omit<Notification, 'key'>) => {
  if (!isBrowser) return

  const key = `${title}-${Date.now()}`
  const options: ExternalToast = {
    id: key,
    description: body,
    duration: ttl > 0 ? ttl * 1e3 : Number.POSITIVE_INFINITY,
  }

  switch (level) {
    case 'success':
      toast.success(title, options)
      break
    case 'warning':
      toast.warning(title, options)
      break
    case 'error':
      toast.error(title, options)
      break
    case 'info':
    default:
      toast.info(title, options)
      break
  }

  return key
}
