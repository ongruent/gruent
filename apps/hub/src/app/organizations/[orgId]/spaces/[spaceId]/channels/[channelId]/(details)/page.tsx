import RelativeTime from '@gruent/hub/components/atoms/RelativeTime'
import DeploymentStatusBadge from '@gruent/hub/components/molecules/DeploymentStatusBadge'
import PageHeader, { PageContent } from '@gruent/hub/components/molecules/PageHeader'
import StatCard from '@gruent/hub/components/molecules/StatCard'
import ChannelExecutionsTable from '@gruent/hub/components/organisms/ChannelExecutionsTable'
import gruentClient from '@gruent/hub/lib/gruent'
import { getChannelExecutionCounts } from '@gruent/hub/lib/server/channelMetrics'
import apiField from '@gruent/hub/util/apiField'
import getAccessToken from '@gruent/hub/util/getAccessToken'
import { Alert, AlertDescription, AlertTitle } from '@gruent/libs/frontend/components/core/alert'
import { Button } from '@gruent/libs/frontend/components/core/button'
import {
  ActivityIcon,
  CircleCheckIcon,
  CircleXIcon,
  GitForkIcon,
  SquarePenIcon,
  TriangleAlertIcon,
} from 'lucide-react'
import Link from 'next/link'
export const metadata = {
  title: 'Channel details | Gruent',
}

const ChannelDetailsPage = async ({ params, searchParams }) => {
  const { orgId, spaceId, channelId } = await params
  const { page: requestedPage = 1 } = await searchParams

  const accessToken = await getAccessToken()
  if (!accessToken) return null

  const { data: channel, errors: getChannelErrors } = await gruentClient(accessToken).channels.get(
    spaceId,
    channelId,
  )

  if (getChannelErrors && getChannelErrors.length > 0)
    return (
      <div className="mx-auto w-full max-w-6xl">
        <Alert variant="destructive" className="w-fit max-w-xl">
          <CircleXIcon />
          <AlertTitle>Could not retrieve the channel</AlertTitle>
          <AlertDescription>{`${getChannelErrors[0]}`}</AlertDescription>
        </Alert>
      </div>
    )

  const {
    data: channelExecutions,
    errors: getChannelExecutionsErrors,
    page,
    totalPages,
    totalResults,
  } = await gruentClient(accessToken).channels.executions.list(spaceId, channelId, {
    page: requestedPage,
  })

  if (getChannelExecutionsErrors && getChannelExecutionsErrors.length > 0)
    return (
      <div className="mx-auto w-full max-w-6xl">
        <Alert variant="destructive" className="w-fit max-w-xl">
          <CircleXIcon />
          <AlertTitle>Could not retrieve the channel executions</AlertTitle>
          <AlertDescription>{`${getChannelExecutionsErrors[0]}`}</AlertDescription>
        </Alert>
      </div>
    )

  const { data: channelStatus, errors: _channelStatusErrors } = await gruentClient(
    accessToken,
  ).channels.status(spaceId, channelId)

  if (!channel)
    return (
      <div className="mx-auto w-full max-w-6xl">
        <Alert className="w-fit max-w-xl">
          <TriangleAlertIcon />
          <AlertTitle>Invalid channel</AlertTitle>
          <AlertDescription>{`This channel does not exist. Try logging out and logging back in.`}</AlertDescription>
        </Alert>
      </div>
    )

  const counts = await getChannelExecutionCounts(accessToken, spaceId, channelId)
  const publishedAt = apiField<string | null>(channel, 'publishedAt')

  return (
    <PageContent>
      <div className="mb-4 text-sm text-muted-foreground">
        <Link
          href={`/organizations/${orgId}/spaces/${spaceId}/channels`}
          className="hover:underline"
        >
          Channels
        </Link>
      </div>
      <PageHeader
        icon={GitForkIcon}
        title={channel.name}
        description={
          <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
            <DeploymentStatusBadge status={channelStatus?.status ?? null} />
            {publishedAt && (
              <span>
                Published <RelativeTime value={publishedAt} />
              </span>
            )}
          </span>
        }
        actions={
          <Button variant="outline" asChild>
            <Link href={`/organizations/${orgId}/spaces/${spaceId}/channels/${channelId}/edit`}>
              <SquarePenIcon />
              <span>Edit</span>
            </Link>
          </Button>
        }
      />
      <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          label="Executions"
          icon={ActivityIcon}
          value={counts.total}
          hint="All recorded"
          unavailableReason={counts.error}
        />
        <StatCard
          label="Completed"
          icon={CircleCheckIcon}
          iconClassName="text-green-600 dark:text-green-500"
          value={counts.completed}
          hint={
            counts.total && counts.completed !== null
              ? `${Math.round((counts.completed / counts.total) * 100)}% of executions`
              : 'No executions yet'
          }
          unavailableReason={counts.error}
        />
        <StatCard
          label="Failures"
          icon={CircleXIcon}
          iconClassName="text-red-500"
          value={counts.failed}
          hint="Failed or timed out"
          unavailableReason={counts.error}
        />
      </div>
      <ChannelExecutionsTable
        orgId={orgId}
        spaceId={spaceId}
        channelExecutionList={channelExecutions ?? []}
        page={page ?? 1}
        totalPages={totalPages ?? 1}
        totalResults={totalResults ?? 0}
      />
    </PageContent>
  )
}

export default ChannelDetailsPage
