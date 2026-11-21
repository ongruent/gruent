import getAccessToken from '@gruent/hub/util/getAccessToken'
import ChannelByIdEditClientPage from './client'
import gruentClient from '@gruent/hub/lib/gruent'
import { Alert, AlertDescription, AlertTitle } from '@gruent/libs/frontend/components/core/alert'
import { CircleXIcon } from 'lucide-react'
export const metadata = {
  title: 'Edit channel | Gruent',
}

const ChannelByIdEditPage = async ({ params }) => {
  const { orgId, spaceId, channelId } = await params

  const accessToken = await getAccessToken()
  if (!accessToken) return null

  const { data: space, errors: spaceErrors } = await gruentClient(accessToken).spaces.get(
    orgId,
    spaceId,
  )

  if (spaceErrors && spaceErrors.length > 0) {
    return (
      <div className="mt-4 px-8 py-2">
        <Alert variant="destructive" className="w-fit max-w-xl">
          <CircleXIcon />
          <AlertTitle>Could not get the space details</AlertTitle>
          <AlertDescription>{`${spaceErrors[0]}`}</AlertDescription>
        </Alert>
      </div>
    )
  }

  const { data: organization, errors: organizationErrors } = await gruentClient(
    accessToken,
  ).organizations.get(orgId ?? '')

  if (organizationErrors && organizationErrors.length > 0) {
    return (
      <div className="mt-4 px-8 py-2">
        <Alert variant="destructive" className="w-fit max-w-xl">
          <CircleXIcon />
          <AlertTitle>Could not get the organization details</AlertTitle>
          <AlertDescription>{`${organizationErrors[0]}`}</AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <ChannelByIdEditClientPage
      orgId={orgId}
      spaceId={spaceId}
      channelId={channelId}
      organization={organization}
      space={space}
    />
  )
}

export default ChannelByIdEditPage
