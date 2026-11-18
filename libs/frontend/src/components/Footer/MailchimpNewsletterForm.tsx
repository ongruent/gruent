'use client'

import { FC, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Button } from '../core/button'
import { Field, FieldLabel } from '../core/field'
import { Input } from '../core/input'
import addNewsletterMember from '@gruent/site/actions/addNewsletterMember'

const FormSubmitButton: FC = () => {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Submitting...' : 'Sign up'}
    </Button>
  )
}

const MailchimpNewsletterForm: FC = () => {
  const [message, setMessage] = useState<string>()

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const formData = new FormData(event.target as HTMLFormElement)
    const email = formData.get('email')

    if (!email || email === '') {
      setMessage('Please enter an email address')
      return
    }

    addNewsletterMember(email as string)
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="mt-6">
        <Field>
          <FieldLabel htmlFor="newsletter-email">Email Address</FieldLabel>
          <div className="flex gap-2">
            <Input
              id="newsletter-email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="jon.snow@winterfell.com"
              className="grow bg-white"
            />
            <FormSubmitButton />
          </div>
        </Field>
      </form>
      {message && (
        <p>
          <small className="text-gray-500">{message}</small>
        </p>
      )}
    </>
  )
}

export default MailchimpNewsletterForm
