import SignInForm from '@gruent/hub/components/organisms/SignInForm'

const VerifyEmailPage = async ({ searchParams }) => {
  const { email } = await searchParams

  return (
    <SignInForm
      allowPassword={false}
      initialEmail={email}
      title="Verify your email"
      description="To sign in for the first time, we'll send a magic link to your email address to verify it. You can sign in with a password after you've verified your email."
    />
  )
}

export default VerifyEmailPage
