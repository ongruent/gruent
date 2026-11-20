import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import useModal, { closeModal, openModal } from './useModal'

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const ModalState = ({ id }: { id: string }) => <span>{useModal(id) ? 'open' : 'closed'}</span>

describe('useModal', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    window.history.replaceState({ __NA: true }, '', '/page?q=1')
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    act(() => root.render(<ModalState id="createThing" />))
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('opens and closes the modal through the URL hash', () => {
    expect(container.textContent).toBe('closed')

    act(() => openModal('createThing'))
    expect(window.location.hash).toBe('#createThing')
    expect(container.textContent).toBe('open')

    act(() => closeModal())
    expect(window.location.pathname + window.location.search + window.location.hash).toBe(
      '/page?q=1',
    )
    expect(container.textContent).toBe('closed')
  })

  it('keeps the router history state and bypasses patched history methods', () => {
    // The Next.js app router patches these on the instance and dispatches a restore action
    // (discarding pending refreshes) when they are called.
    const patchedPush = jest.fn()
    const patchedReplace = jest.fn()
    window.history.pushState = patchedPush
    window.history.replaceState = patchedReplace

    try {
      act(() => openModal('createThing'))
      expect(window.history.state).toEqual({ __NA: true })

      act(() => closeModal())
      expect(window.history.state).toEqual({ __NA: true })

      expect(patchedPush).not.toHaveBeenCalled()
      expect(patchedReplace).not.toHaveBeenCalled()
    } finally {
      // remove the instance overrides so the prototype methods are used again
      delete (window.history as Partial<History>).pushState
      delete (window.history as Partial<History>).replaceState
    }
  })

  it('stays closed if the router writes the closed modal hash back', () => {
    act(() => openModal('createThing'))
    act(() => closeModal())

    // e.g. the router restoring a deep-linked URL after a refresh
    act(() => window.history.replaceState(window.history.state, '', '/page?q=1#createThing'))
    act(() => root.render(<ModalState id="createThing" />))
    expect(container.textContent).toBe('closed')

    act(() => openModal('createThing'))
    expect(container.textContent).toBe('open')
  })

  it('reacts to hash navigation from links', () => {
    act(() => {
      window.location.hash = 'createThing'
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    expect(container.textContent).toBe('open')
  })
})
