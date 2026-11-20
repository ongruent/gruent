import AuthLayout from '@gruent/hub/components/layouts/AuthLayout'
import AuthCard from '@gruent/hub/components/molecules/AuthCard'
import { Button } from '@gruent/libs/frontend/components/core/button'
import { ArrowLeftIcon, LinkIcon } from 'lucide-react'
import Link from 'next/link'

export const metadata = {
  title: 'Verify magic link | GRUENT',
}

const UNKNOWN_ERROR = 'An unknown error occurred when verifying the magic link.'

const VerifyMagicLinkPage = async ({ searchParams }) => {
  const { error } = await searchParams

  const decodedError = (() => {
    if (!error) return UNKNOWN_ERROR
    try {
      return decodeURIComponent(error)
    } catch (_e) {
      return UNKNOWN_ERROR
    }
  })()

  return (
    <AuthLayout>
      <AuthCard
        icon={LinkIcon}
        iconClassName="text-destructive"
        title="This magic link didn't work"
        description="Magic links expire 15 minutes after they are sent. Request a new one to sign in."
      >
        <p className="rounded-md border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
          {decodedError}
        </p>
        <Button asChild className="w-full">
          <Link href="/signin">
            <ArrowLeftIcon />
            Back to sign in
          </Link>
        </Button>
      </AuthCard>
    </AuthLayout>
  )
}

export default VerifyMagicLinkPage
