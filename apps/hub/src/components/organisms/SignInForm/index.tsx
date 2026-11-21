'use client'

import { signInWithCredentials, signInWithMagicLink } from '@gruent/hub/actions/auth'
import PasswordInput from '@gruent/hub/components/atoms/PasswordInput'
import AuthCard from '@gruent/hub/components/molecules/AuthCard'
import { Alert, AlertDescription, AlertTitle } from '@gruent/libs/frontend/components/core/alert'
import { Button } from '@gruent/libs/frontend/components/core/button'
import { Field, FieldGroup, FieldLabel } from '@gruent/libs/frontend/components/core/field'
import { Input } from '@gruent/libs/frontend/components/core/input'
import Modal from '@gruent/libs/frontend/components/Modal'
import { openModal } from '@gruent/libs/frontend/hooks/useModal'
import { addToast } from '@gruent/libs/frontend/hooks/useToast'
import {
  ArrowLeftIcon,
  CircleXIcon,
  KeyRoundIcon,
  LoaderCircleIcon,
  MailCheckIcon,
  MailIcon,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FormEventHandler, ReactNode, useState } from 'react'

type Props = {
  allowPassword?: boolean
  initialEmail?: string
  title?: string
  description?: ReactNode
}

type FormError = { title: string; body: string }

const SignInForm = ({
  allowPassword = true,
  initialEmail,
  title = 'Sign in to Gruent',
  description = 'Welcome back. Enter your email to continue.',
}: Props) => {
  const [passwordEnabled, setPasswordEnabled] = useState<boolean>(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<FormError | null>(null)
  /** Email address the magic link was last sent to. */
  const [sentTo, setSentTo] = useState<string | null>(null)

  const router = useRouter()

  const sendMagicLink = async (email: string) => {
    const { error, redirect } = await signInWithMagicLink({
      email,
      appUrl: `${window.location.origin}`,
      redirectTo: `${window.location.origin}/dashboard`,
    })

    if (redirect) {
      router.push(redirect)
      return
    }

    if (error) {
      setError({ title: 'Could not send magic link', body: error })
      return
    }

    setSentTo(email)
    addToast({
      title: 'Magic link sent',
      body: 'Check your email to finish authenticating',
      level: 'success',
      ttl: 5,
    })
  }

  const signInWithPassword = async (email: string, password: string) => {
    const { error, redirect } = await signInWithCredentials({
      email,
      password,
      redirectTo: `${window.location.origin}/dashboard`,
    })

    if (redirect) {
      router.push(redirect)
      return
    }

    if (error === 'email is not verified') {
      router.push(`/verify-email?email=${encodeURIComponent(email)}`)
      return
    }

    if (error) {
      setError({ title: 'Could not sign in', body: error })
      return
    }

    router.push('/dashboard')
  }

  const submit = async (action: () => Promise<void>) => {
    setError(null)
    setSubmitting(true)
    try {
      await action()
    } finally {
      setSubmitting(false)
    }
  }

  const handleLoginFormSubmit: FormEventHandler = async (e) => {
    e.preventDefault()

    const formData = new FormData(e.target as HTMLFormElement)

    const email = formData.get('email') as string
    const password = formData.get('password') as string

    await submit(() => (password ? signInWithPassword(email, password) : sendMagicLink(email)))
  }

  const errorAlert = error && (
    <Alert variant="destructive">
      <CircleXIcon />
      <AlertTitle>{error.title}</AlertTitle>
      <AlertDescription>{error.body}</AlertDescription>
    </Alert>
  )

  if (sentTo) {
    return (
      <AuthCard
        icon={MailCheckIcon}
        iconClassName="text-primary"
        title="Check your email"
        description={
          <>
            We sent a sign-in link to <span className="font-medium text-foreground">{sentTo}</span>.
            Open it on this device to continue.
          </>
        }
      >
        {errorAlert}
        <div className="flex flex-col gap-2">
          <Button
            id="resendMagicLink"
            variant="outline"
            disabled={submitting}
            onClick={() => submit(() => sendMagicLink(sentTo))}
          >
            {submitting && <LoaderCircleIcon className="animate-spin" />}
            Resend link
          </Button>
          <Button
            variant="ghost"
            className="text-muted-foreground"
            disabled={submitting}
            onClick={() => {
              setError(null)
              setSentTo(null)
            }}
          >
            <ArrowLeftIcon />
            Use a different email
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Can't find it? Check your spam folder. The link expires after 15 minutes.
        </p>
      </AuthCard>
    )
  }

  return (
    <AuthCard
      title={title}
      description={description}
      footer={
        <>
          No account?{' '}
          <Link id="signup" href={'/signup'} className="font-medium text-primary hover:underline">
            Sign up
          </Link>
        </>
      }
    >
      <Modal id="forgot-password" title="Forgot password" showTitle showAccept={false}>
        <p className="text-sm text-muted-foreground">
          If you have forgotten your password, you can use magic link authentication to sign in to
          your account. Once signed in, visit your profile page to update your password.
        </p>
      </Modal>
      <form onSubmit={handleLoginFormSubmit} className="flex flex-col gap-5">
        <FieldGroup className="gap-4">
          <Field>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input
              id="email"
              name="email"
              type="email"
              required
              placeholder="you@company.com"
              defaultValue={initialEmail}
              autoComplete="email"
              spellCheck={false}
              aria-invalid={error ? true : undefined}
            />
          </Field>
          {passwordEnabled && (
            <Field>
              <div className="flex items-center justify-between">
                <FieldLabel htmlFor="password">Password</FieldLabel>
                <button
                  id="forgot-password"
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                  onClick={() => openModal('forgot-password')}
                >
                  Forgot password?
                </button>
              </div>
              <PasswordInput
                id="password"
                name="password"
                required
                autoComplete="current-password"
                spellCheck={false}
                aria-invalid={error ? true : undefined}
              />
            </Field>
          )}
        </FieldGroup>
        {errorAlert}
        <Button id="submit" className="w-full" type="submit" disabled={submitting}>
          {submitting ? (
            <LoaderCircleIcon className="animate-spin" />
          ) : passwordEnabled ? null : (
            <MailIcon />
          )}
          {passwordEnabled ? 'Continue' : 'Send magic link'}
        </Button>
      </form>
      {(allowPassword || passwordEnabled) && (
        <>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <hr className="grow" />
            or
            <hr className="grow" />
          </div>
          {passwordEnabled ? (
            <Button
              id="magicLink"
              type="button"
              variant="outline"
              onClick={() => {
                setError(null)
                setPasswordEnabled(false)
              }}
            >
              <MailIcon />
              Sign in with magic link
            </Button>
          ) : (
            <Button
              id="userpass"
              type="button"
              variant="outline"
              onClick={() => {
                setError(null)
                setPasswordEnabled(true)
              }}
            >
              <KeyRoundIcon />
              Sign in with password
            </Button>
          )}
        </>
      )}
    </AuthCard>
  )
}

export default SignInForm
