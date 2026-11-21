import gruentClient from '@gruent/hub/lib/gruent'
import getAccessToken from '@gruent/hub/util/getAccessToken'
import { Alert, AlertDescription, AlertTitle } from '@gruent/libs/frontend/components/core/alert'
import StepExecutionLogEntry from '@gruent/libs/frontend/components/StepExecutionLogEntry'
import dayjs from 'dayjs'
import { CircleXIcon, TriangleAlertIcon } from 'lucide-react'
import Link from 'next/link'
export const metadata = {
  title: 'Channel execution details | Gruent',
}

const ChannelExecutionByIdPage = async ({ params }) => {
  const { orgId, spaceId, channelId, executionId: channelExecutionId } = await params

  const accessToken = await getAccessToken()
  if (!accessToken) return null

  const { data: channelExecution, errors: getChannelExecutionErrors } = await gruentClient(
    accessToken,
  ).channels.executions.get(spaceId, channelExecutionId)

  if (getChannelExecutionErrors && getChannelExecutionErrors.length > 0)
    return (
      <div className="mx-auto w-full max-w-6xl">
        <Alert variant="destructive" className="w-fit max-w-xl">
          <CircleXIcon />
          <AlertTitle>Could not retrieve the channel execution</AlertTitle>
          <AlertDescription>{`${getChannelExecutionErrors[0]}`}</AlertDescription>
        </Alert>
      </div>
    )

  if (!channelExecution)
    return (
      <div className="mx-auto w-full max-w-6xl">
        <Alert className="w-fit max-w-xl">
          <TriangleAlertIcon />
          <AlertTitle>Invalid channel execution</AlertTitle>
          <AlertDescription>{`This channel execution does not exist. Try logging out and logging back in.`}</AlertDescription>
        </Alert>
      </div>
    )

  const { executionId, status, startTime, endTime, durationMs } = channelExecution

  const stepExecutionLogsJsx = (() => {
    const { stepExecutionLogs } = channelExecution

    return stepExecutionLogs.map((stepExecutionLog, index) => {
      const { level, timestamp, logAttributes } = stepExecutionLog
      const { node: step } = logAttributes

      return (
        <StepExecutionLogEntry
          key={`${step}-${level}-${timestamp}-${index}`}
          stepExecutionLog={stepExecutionLog}
        />
      )
    })
  })()

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="mb-4 text-muted-foreground">
        <small>
          <Link href={`/organizations/${orgId}/spaces/${spaceId}/channels`}>Channels</Link>{' '}
          &gt;&nbsp;
          <Link href={`/organizations/${orgId}/spaces/${spaceId}/channels/${channelId}`}>
            Channel
          </Link>{' '}
          &gt;&nbsp;
          {channelExecutionId}
        </small>
      </div>
      <h1>{executionId}</h1>
      {status === 'COMPLETED' || status === 'ERRORED' || status === 'TIMEOUT' ? (
        <p>
          <small>
            {status} - Started at {dayjs(startTime).format('MM/DD/YYYY HH:mm:ss.SSS')}, ended at{' '}
            {dayjs(endTime).format('MM/DD/YYYY HH:mm:ss.SSS')} ({durationMs}ms)
          </small>
        </p>
      ) : (
        <p>
          <small>{status}</small>
        </p>
      )}
      <div className="w-full min-w-0">{stepExecutionLogsJsx}</div>
    </div>
  )
}

export default ChannelExecutionByIdPage
