import gruentClient from '@gruent/hub/lib/gruent'
import apiField from '@gruent/hub/util/apiField'
import type { ChannelExecutionListItem } from '@gruent/libs/gruent-js/src/channels/executions/list'
import type { Channel } from '@prisma/client'

/**
 * Channel execution metrics for the hub, built only from existing API capabilities:
 *
 * - execution counts are the `totalResults` of the channel executions list, optionally filtered by
 *   execution status (`completed`, `failed`, `timeout`). They cover every execution the platform still
 *   has recorded, not a fixed time window.
 * - deployment state is the controller's live channel status.
 *
 * A metric is `null` when any request behind it failed, so the hub can show it as unavailable instead of
 * presenting a partial number as the real one.
 */

/** Most channels the space overview reads metrics for. Each channel costs a few API requests. */
export const OVERVIEW_CHANNEL_LIMIT = 50

const CONCURRENCY = 8

export type DeploymentStatus = 'PUBLISHED' | 'UNPUBLISHED' | 'INITIALIZING'

export type ChannelExecutionCounts = {
  total: number | null
  completed: number | null
  /** Executions that failed or timed out. */
  failed: number | null
  latest: ChannelExecutionListItem | null
}

export type ChannelMetrics = ChannelExecutionCounts & {
  channel: Channel
  status: DeploymentStatus | null
}

export type SpaceOverviewMetrics = {
  /** Channels in the space, or `null` if they could not be listed. */
  channelCount: number | null
  /** The channels the metrics below cover (the first `OVERVIEW_CHANNEL_LIMIT`). */
  channels: ChannelMetrics[]
  executions: { total: number | null; completed: number | null; failed: number | null }
  deployed: number | null
  initializing: number | null
  /** Channels with a publish request recorded, independent of the controller. */
  publishRequested: number
  errors: { executions?: string; status?: string; channels?: string }
}

const sum = (values: (number | null)[]) =>
  values.some((value) => value === null) ? null : values.reduce<number>((a, b) => a + (b ?? 0), 0)

const mapLimit = async <T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>) => {
  const results: R[] = new Array(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const index = next++
      results[index] = await fn(items[index])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

const countExecutions = async (
  accessToken: string,
  spaceId: string,
  channelId: string,
  statusFilter?: string,
) => {
  const { data, errors, totalResults } = await gruentClient(accessToken).channels.executions.list(
    spaceId,
    channelId,
    { page: 1, resultsPerPage: 1, statusFilter },
  )
  if ((errors && errors.length > 0) || !data || totalResults === undefined) {
    return { count: null, latest: null, error: errors?.[0] ?? 'Execution history is unavailable' }
  }
  return { count: totalResults, latest: data[0] ?? null, error: undefined }
}

const firstError = (...errors: (string | undefined)[]) => errors.find(Boolean)

/** Execution counts for one channel. */
export const getChannelExecutionCounts = async (
  accessToken: string,
  spaceId: string,
  channelId: string,
): Promise<ChannelExecutionCounts & { error?: string }> => {
  const [all, completed, failed, timedOut] = await Promise.all([
    countExecutions(accessToken, spaceId, channelId),
    countExecutions(accessToken, spaceId, channelId, 'completed'),
    countExecutions(accessToken, spaceId, channelId, 'failed'),
    countExecutions(accessToken, spaceId, channelId, 'timeout'),
  ])

  return {
    total: all.count,
    completed: completed.count,
    failed: sum([failed.count, timedOut.count]),
    latest: all.latest,
    error: firstError(all.error, completed.error, failed.error, timedOut.error),
  }
}

export const getChannelDeploymentStatus = async (
  accessToken: string,
  spaceId: string,
  channelId: string,
): Promise<{ status: DeploymentStatus | null; error?: string }> => {
  const { data, errors } = await gruentClient(accessToken).channels.status(spaceId, channelId)
  if ((errors && errors.length > 0) || !data?.status) {
    return { status: null, error: errors?.[0] ?? 'Channel status is unavailable' }
  }
  return { status: data.status }
}

/** Execution and deployment metrics for the channels of a space. */
export const getSpaceOverviewMetrics = async (
  accessToken: string,
  spaceId: string,
): Promise<SpaceOverviewMetrics> => {
  const {
    data: channels,
    errors,
    totalResults,
  } = await gruentClient(accessToken).channels.list(spaceId, {
    page: 1,
    resultsPerPage: OVERVIEW_CHANNEL_LIMIT,
  })

  if ((errors && errors.length > 0) || !channels) {
    const error = errors?.[0] ?? 'Channels could not be listed'
    return {
      channelCount: null,
      channels: [],
      executions: { total: null, completed: null, failed: null },
      deployed: null,
      initializing: null,
      publishRequested: 0,
      errors: { channels: error, executions: error, status: error },
    }
  }

  const results = await mapLimit(channels, CONCURRENCY, async (channel) => {
    const [counts, status] = await Promise.all([
      getChannelExecutionCounts(accessToken, spaceId, channel.id),
      getChannelDeploymentStatus(accessToken, spaceId, channel.id),
    ])
    return { counts, status }
  })

  const channelMetrics: ChannelMetrics[] = channels.map((channel, index) => {
    const { counts, status } = results[index]
    return {
      channel,
      status: status.status,
      total: counts.total,
      completed: counts.completed,
      failed: counts.failed,
      latest: counts.latest,
    }
  })

  const statuses = channelMetrics.map((metrics) => metrics.status)
  const statusAvailable = statuses.every((status) => status !== null)

  return {
    channelCount: totalResults ?? channels.length,
    channels: channelMetrics,
    executions: {
      total: sum(channelMetrics.map((metrics) => metrics.total)),
      completed: sum(channelMetrics.map((metrics) => metrics.completed)),
      failed: sum(channelMetrics.map((metrics) => metrics.failed)),
    },
    deployed: statusAvailable ? statuses.filter((status) => status === 'PUBLISHED').length : null,
    initializing: statusAvailable
      ? statuses.filter((status) => status === 'INITIALIZING').length
      : null,
    publishRequested: channels.filter((channel) => Boolean(apiField(channel, 'publishedAt')))
      .length,
    errors: {
      executions: firstError(...results.map((result) => result.counts.error)),
      status: firstError(...results.map((result) => result.status.error)),
    },
  }
}
