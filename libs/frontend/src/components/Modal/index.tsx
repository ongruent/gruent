'use client'

import { Button } from '@gruent/libs/frontend/components/core/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@gruent/libs/frontend/components/core/sheet'
import useModal, { closeModal } from '@gruent/libs/frontend/hooks/useModal'
import noop from '@gruent/libs/frontend/util/noop'
import { cn } from 'cn'
import type { CSSProperties, FC, PropsWithChildren } from 'react'

type Props = {
  /** Modal id. The modal is open while `window.location.hash === #<id>` (see `openModal`). */
  id: string
  /** Accessible title. Rendered visually only when `showTitle` is set. */
  title?: string
  description?: string
  showTitle?: boolean
  onAccept?: () => void
  onClose?: () => void
  showClose?: boolean
  showAccept?: boolean
  hideForceClose?: boolean
  acceptText?: string
  acceptDisabled?: boolean
  style?: CSSProperties
  className?: string
}

/**
 * Hash-routed side panel built on the shadcn/ui `Sheet`. Opened with `openModal(id)` and
 * closed with `closeModal()` from `hooks/useModal`, so modals stay deep-linkable.
 */
const Modal: FC<PropsWithChildren<Props>> = ({
  id,
  title,
  description,
  showTitle = false,
  children,
  onAccept = noop,
  onClose = closeModal,
  showClose = true,
  showAccept = true,
  hideForceClose = false,
  acceptText = 'Accept',
  acceptDisabled = false,
  style,
  className,
}) => {
  const open = useModal(id)

  return (
    <Sheet
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose()
      }}
    >
      <SheetContent
        side="right"
        showCloseButton={!hideForceClose}
        style={style}
        className={cn('w-full gap-0 overflow-y-auto sm:max-w-lg', className)}
        // silence Radix's missing-description warning when there is no description
        {...(description ? {} : { 'aria-describedby': undefined })}
        onInteractOutside={(e) => {
          // keep the modal open when a toast (or something inside one) is clicked
          const target = e.target as HTMLElement | null
          if (target?.closest?.('[data-sonner-toaster]')) e.preventDefault()
        }}
      >
        <SheetHeader className={showTitle ? 'px-7 pt-8 pb-0' : 'sr-only'}>
          <SheetTitle>{title ?? id}</SheetTitle>
          {description && <SheetDescription>{description}</SheetDescription>}
        </SheetHeader>
        <div className="px-7 py-8">{children}</div>
        {(showClose || showAccept) && (
          <SheetFooter className="flex-row gap-4 border-t px-7 py-6">
            {showClose && (
              <Button className="grow" variant="outline" onClick={onClose}>
                Close
              </Button>
            )}
            {showAccept && (
              <Button
                id={`${id}Submit`}
                className="grow"
                onClick={onAccept}
                disabled={acceptDisabled}
              >
                {acceptText}
              </Button>
            )}
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  )
}

export default Modal
