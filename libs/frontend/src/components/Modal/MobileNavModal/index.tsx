'use client'

import Modal from '@gruent/libs/frontend/components/Modal'
import { closeModal } from '@gruent/libs/frontend/hooks/useModal'
import Image from 'next/image'
import Link from 'next/link'

const MobileNavModal = () => {
  return (
    <Modal id="mobileNav" title="Navigation" showAccept={false}>
      <Image
        src="/img/logos/mark-cutout-secondary.png"
        alt="Gruent logo"
        width={30}
        height={30}
        className="mb-4"
      />
      <ul className="flex flex-col gap-2">
        <li>
          <Link href="/" onClick={closeModal}>
            Home
          </Link>
        </li>
        <li>
          <Link href="/blog" onClick={closeModal}>
            Blog
          </Link>
        </li>
        <li>
          <Link href="/docs" onClick={closeModal}>
            Docs
          </Link>
        </li>
        <li>
          <Link href="/pricing" onClick={closeModal}>
            Pricing
          </Link>
        </li>
      </ul>
    </Modal>
  )
}

export default MobileNavModal
