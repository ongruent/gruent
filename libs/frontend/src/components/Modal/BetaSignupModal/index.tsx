'use client'

import { FC, useRef } from 'react'

import Modal from '@gruent/libs/frontend/components/Modal'
import { Field, FieldLabel } from '../../core/field'
import { Input } from '../../core/input'
import { closeModal } from '@gruent/libs/frontend/hooks/useModal'
import addNewsletterMember from '@gruent/site/actions/addNewsletterMember'
import { LoaderCircleIcon } from 'lucide-react'
import { useMutation } from '@tanstack/react-query'

type Props = {}

const BetaSignupModal: FC<Props> = ({}) => {
  const formRef = useRef<HTMLFormElement>(null)

  const { mutate, data, isPending } = useMutation({
    mutationFn: async (email: string) => {
      if (!email || email === '') {
        return { message: 'Please enter an email address' }
      }

      const result = await addNewsletterMember(email)
      return result
    },
  })

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const formData = new FormData(event.target as HTMLFormElement)
    const email = formData.get('email')

    await mutate(email as string)
  }

  const onAccept = () => {
    if (!formRef.current) return
    formRef.current.requestSubmit()
  }

  const onClose = () => {
    if (!formRef.current) return
    formRef.current.reset()
    closeModal()
  }

  return (
    <Modal
      id="betaSignup"
      title="Beta Mailing List Signup"
      acceptText="Sign Up"
      onAccept={onAccept}
      onClose={onClose}
    >
      <h2>Beta Mailing List Signup</h2>
      <p className="mt-2">
        Our platform hasn&apos;t launched yet, but we&apos;re nearly there. Enter your email below
        to be notified when we make our beta platform available.
      </p>
      <form ref={formRef} onSubmit={onSubmit} className="mt-6 mb-4">
        <Field>
          <FieldLabel htmlFor="beta-signup-email">Email Address</FieldLabel>
          <Input
            id="beta-signup-email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="jon.snow@winterfell.com"
          />
        </Field>
        {isPending && (
          <p>
            <LoaderCircleIcon size=".875em" className="animate-spin" />
          </p>
        )}
        {data?.message && (
          <p>
            <small className="text-gray-500">{data.message}</small>
          </p>
        )}
      </form>
    </Modal>
  )
}

export default BetaSignupModal
