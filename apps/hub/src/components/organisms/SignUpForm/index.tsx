'use client'

import { signup } from '@gruent/hub/actions/auth'
import PasswordInput from '@gruent/hub/components/atoms/PasswordInput'
import AuthCard from '@gruent/hub/components/molecules/AuthCard'
import { Alert, AlertDescription, AlertTitle } from '@gruent/libs/frontend/components/core/alert'
import { Button } from '@gruent/libs/frontend/components/core/button'
import { Field, FieldGroup, FieldLabel } from '@gruent/libs/frontend/components/core/field'
import { Input } from '@gruent/libs/frontend/components/core/input'
import { addToast } from '@gruent/libs/frontend/hooks/useToast'
import { CircleXIcon, LoaderCircleIcon, MailPlusIcon, TriangleAlertIcon } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FC, FormEventHandler, useState } from 'react'

type Props = {
  invitation?: {
    email: string
    orgId: string
  }
  inviteToken?: string
  inviteTokenError?: string
}

const SignUpForm: FC<Props> = ({ invitation, inviteToken, inviteTokenError }) => {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const router = useRouter()

  const handleSignupFormSubmit: FormEventHandler = async (e) => {
    e.preventDefault()

    const formData = new FormData(e.target as HTMLFormElement)

    const email = formData.get('email') as string
    const password = formData.get('password') as string

    setError(null)
    setSubmitting(true)
    try {
      // Sign up
      const { error } = await signup({
        email,
        password,
        inviteToken,
        origin: window.location.origin,
      })

      if (error) {
        setError(error)
        return
      }

      addToast({
        title: 'Account created',
        body: 'An email has been sent to verify your account. Once verified, sign in to continue.',
        level: 'success',
        ttl: 5,
      })
      router.push(`/verify-email?email=${encodeURIComponent(email)}`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthCard
      title={invitation ? "You've been invited" : 'Create your account'}
      description={
        invitation
          ? 'Sign up to join the organization you were invited to.'
          : 'Connect devices and services, and automate them with channels.'
      }
      icon={invitation ? MailPlusIcon : undefined}
      iconClassName="text-primary"
      footer={
        <>
          Already have an account?{' '}
          <Link id="signin" href={'/signin'} className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      {inviteTokenError && (
        <Alert>
          <TriangleAlertIcon />
          <AlertTitle>Invalid or expired invitation</AlertTitle>
          <AlertDescription>
            {inviteTokenError}. Ask whoever invited you to send a new invitation.
          </AlertDescription>
        </Alert>
      )}
      <form onSubmit={handleSignupFormSubmit} className="flex flex-col gap-5">
        <FieldGroup className="gap-4">
          <Field>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input
              id="email"
              name="email"
              type="email"
              required
              placeholder="you@company.com"
              defaultValue={invitation?.email}
              autoComplete="email"
              spellCheck={false}
              aria-invalid={error ? true : undefined}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <PasswordInput
              id="password"
              name="password"
              required
              autoComplete="new-password"
              spellCheck={false}
              aria-invalid={error ? true : undefined}
            />
          </Field>
        </FieldGroup>
        {error && (
          <Alert variant="destructive">
            <CircleXIcon />
            <AlertTitle>Could not sign up</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Button id="submit" className="w-full" type="submit" disabled={submitting}>
          {submitting && <LoaderCircleIcon className="animate-spin" />}
          Create account
        </Button>
      </form>
    </AuthCard>
  )
}

export default SignUpForm
