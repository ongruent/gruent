'use client'

import { Button } from '@gruent/libs/frontend/components/core/button'
import { openModal } from '@gruent/libs/frontend/hooks/useModal'
import type { ComponentProps } from 'react'

type Props = Omit<ComponentProps<typeof Button>, 'onClick'> & {
  modalId: string
}

/**
 * Client-side `Button` that opens the modal with the given id. Lets server components render
 * modal triggers without becoming client components themselves.
 */
const OpenModalButton = ({ modalId, ...props }: Props) => (
  <Button {...props} onClick={() => openModal(modalId)} />
)

export default OpenModalButton
