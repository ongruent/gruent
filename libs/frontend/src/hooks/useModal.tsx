'use client'

import { useCallback, useSyncExternalStore } from 'react'
import isBrowser from '../util/isBrowser'

/** Dispatched on `window` by `openModal`/`closeModal`, which change the URL without a `hashchange`. */
const MODAL_CHANGE_EVENT = 'gruent:modalchange'

/**
 * Hash of the modal most recently closed with `closeModal`. The Next.js router can write a
 * stale hash back into the URL (e.g. after a deep-linked modal is closed and the page is
 * refreshed), so a closed modal stays closed until it is opened again.
 */
let dismissedHash: string | null = null

const subscribe = (onChange: () => void) => {
  // hashchange/popstate come from the user (links, back/forward), so they reset `dismissedHash`
  const onNavigation = () => {
    dismissedHash = null
    onChange()
  }

  window.addEventListener('hashchange', onNavigation)
  window.addEventListener('popstate', onNavigation)
  window.addEventListener(MODAL_CHANGE_EVENT, onChange)

  return () => {
    window.removeEventListener('hashchange', onNavigation)
    window.removeEventListener('popstate', onNavigation)
    window.removeEventListener(MODAL_CHANGE_EVENT, onChange)
  }
}

const getServerSnapshot = () => false

/**
 * Returns whether the modal with the given id is open, i.e. whether `window.location.hash`
 * is `#<id>`.
 */
const useModal = (id: string) => {
  const getSnapshot = useCallback(() => {
    const hash = `#${id}`
    return window.location.hash === hash && dismissedHash !== hash
  }, [id])

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

/**
 * Opening and closing a modal must not go through the Next.js app router. Assigning
 * `window.location.hash`, or calling `history.pushState`/`replaceState` without the router's
 * own history state, makes the router dispatch a restore action, which discards any pending
 * router work, such as a server action's revalidation or a `router.refresh()` started right
 * after the modal closes. The router patches `pushState`/`replaceState` on the `window.history`
 * instance, so the unpatched `History.prototype` methods are used, and the current
 * `history.state` (which carries the router's internal state) is kept so back/forward still work.
 */
const setModalHash = (hash: string, method: 'pushState' | 'replaceState') => {
  History.prototype[method].call(
    window.history,
    window.history.state,
    '',
    window.location.pathname + window.location.search + hash,
  )
  window.dispatchEvent(new Event(MODAL_CHANGE_EVENT))
}

/**
 * Opens a modal by adding `#<id>` to the URL.
 *
 * @param {string} id - The id of the modal to open.
 */
export const openModal = (id: string) => {
  if (!isBrowser) return
  dismissedHash = null
  setModalHash(`#${id}`, 'pushState')
}

/**
 * Closes the open modal by removing the hash from the URL.
 */
export const closeModal = () => {
  if (!isBrowser) return
  dismissedHash = window.location.hash || null
  setModalHash('', 'replaceState')
}

export default useModal
