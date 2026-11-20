import RelativeTime from '@gruent/hub/components/atoms/RelativeTime'
import CreateChannelModal from '@gruent/hub/components/modals/CreateChannelModal'
import DeploymentStatusBadge from '@gruent/hub/components/molecules/DeploymentStatusBadge'
import PageHeader, { PageContent } from '@gruent/hub/components/molecules/PageHeader'
import Panel from '@gruent/hub/components/molecules/Panel'
import StatCard from '@gruent/hub/components/molecules/StatCard'
import gruentClient from '@gruent/hub/lib/gruent'
import { getSpaceOverviewMetrics } from '@gruent/hub/lib/server/channelMetrics'
import getAccessToken from '@gruent/hub/util/getAccessToken'
import { Button } from '@gruent/libs/frontend/components/core/button'
import { Skeleton } from '@gruent/libs/frontend/components/core/skeleton'
import OpenModalButton from '@gruent/libs/frontend/components/OpenModalButton'
import {
  ActivityIcon,
  ArrowRightIcon,
  CircleCheckIcon,
  CirclePlusIcon,
  CircleXIcon,
  CloudIcon,
  GitForkIcon,
  KeyRoundIcon,
  LayoutDashboardIcon,
  type LucideIcon,
  ShapesIcon,
  WaypointsIcon,
} from 'lucide-react'
import Link from 'next/link'
import { Suspense } from 'react'

export const metadata = {
  title: 'Space overview | GRUENT',
}

const RECENT_CHANNEL_ROWS = 8

const percent = (part: number | null, whole: number | null) => {
  if (part === null || whole === null || whole === 0) return null
  return `${Math.round((part / whole) * 100)}%`
}

const pluralize = (count: number, singular: string, plural = `${singular}s`) =>
  `${count} ${count === 1 ? singular : plural}`

/** Execution and deployment metrics. Slow (a few requests per channel), so it streams in. */
const OverviewMetrics = async ({
  accessToken,
  orgId,
  spaceId,
}: {
  accessToken: string
  orgId: string
  spaceId: string
}) => {
  const metrics = await getSpaceOverviewMetrics(accessToken, spaceId)
  const { executions, channelCount } = metrics
  const base = `/organizations/${orgId}/spaces/${spaceId}`
  const truncated = channelCount !== null && channelCount > metrics.channels.length

  const scope = [
    'All recorded executions',
    truncated
      ? `of the first ${metrics.channels.length} of ${channelCount} channels`
      : channelCount !== null
        ? `across ${pluralize(channelCount, 'channel')}`
        : undefined,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Channel executions"
          icon={ActivityIcon}
          value={executions.total}
          hint="All recorded"
          unavailableReason={metrics.errors.executions}
        />
        <StatCard
          label="Completed"
          icon={CircleCheckIcon}
          iconClassName="text-green-600 dark:text-green-500"
          value={executions.completed}
          hint={
            percent(executions.completed, executions.total)
              ? `${percent(executions.completed, executions.total)} of executions`
              : 'No executions yet'
          }
          unavailableReason={metrics.errors.executions}
        />
        <StatCard
          label="Failures"
          icon={CircleXIcon}
          iconClassName="text-red-500"
          value={executions.failed}
          hint="Failed or timed out"
          unavailableReason={metrics.errors.executions}
        />
        <StatCard
          label="Deployed channels"
          icon={CloudIcon}
          value={metrics.deployed}
          hint={
            channelCount !== null &&
            `of ${pluralize(channelCount, 'channel')}${metrics.initializing ? ` · ${metrics.initializing} initializing` : ''}`
          }
          unavailableReason={
            metrics.errors.status &&
            `${metrics.errors.status} (${pluralize(metrics.publishRequested, 'channel')} marked published)`
          }
        />
      </div>
      <p className="mt-2 mb-8 text-xs text-muted-foreground">
        {scope}. Deployment status is read live from the controller.
      </p>

      <Panel
        title="Channels"
        description={
          metrics.channels.length > 0
            ? 'Deployment status and execution history per channel.'
            : undefined
        }
        actions={
          metrics.channels.length > 0 && (
            <Button variant="ghost" size="sm" asChild>
              <Link href={`${base}/channels`}>
                View all
                <ArrowRightIcon />
              </Link>
            </Button>
          )
        }
      >
        {metrics.errors.channels && (
          <p className="px-4 py-6 text-sm text-muted-foreground">
            Channels could not be listed: {metrics.errors.channels}
          </p>
        )}
        {!metrics.errors.channels && metrics.channels.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
            <GitForkIcon className="size-8 rotate-180 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No channels... yet!</p>
            <OpenModalButton modalId="createChannel" size="sm">
              <CirclePlusIcon />
              <span>Create your first channel</span>
            </OpenModalButton>
          </div>
        )}
        {metrics.channels.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="px-4 py-2 font-normal">Name</th>
                <th className="px-4 py-2 font-normal">Status</th>
                <th className="px-4 py-2 text-right font-normal">Executions</th>
                <th className="px-4 py-2 text-right font-normal">Failures</th>
                <th className="px-4 py-2 text-right font-normal">Last execution</th>
              </tr>
            </thead>
            <tbody>
              {metrics.channels.slice(0, RECENT_CHANNEL_ROWS).map((row) => (
                <tr key={row.channel.id} className="border-b last:border-0 hover:bg-muted/40">
                  <td className="px-4 py-2.5">
                    <Link
                      href={`${base}/channels/${row.channel.id}`}
                      className="font-medium hover:underline"
                    >
                      {row.channel.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">
                    <DeploymentStatusBadge status={row.status} />
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {row.total?.toLocaleString('en') ?? '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {row.failed === null ? (
                      '—'
                    ) : (
                      <span className={row.failed > 0 ? 'text-red-600 dark:text-red-400' : ''}>
                        {row.failed.toLocaleString('en')}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <RelativeTime
                      value={row.latest?.startTime}
                      fallback={row.total === null ? '—' : 'Never'}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {metrics.channels.length > RECENT_CHANNEL_ROWS && (
          <div className="border-t px-4 py-2 text-xs text-muted-foreground">
            Showing {RECENT_CHANNEL_ROWS} of {channelCount ?? metrics.channels.length} channels.
          </div>
        )}
      </Panel>
    </>
  )
}

const OverviewMetricsSkeleton = () => (
  <>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className="flex flex-col gap-3 rounded-lg border bg-card p-4">
          <Skeleton className="h-4 w-28 animate-shimmer" />
          <Skeleton className="h-7 w-16 animate-shimmer" />
        </div>
      ))}
    </div>
    <p className="mt-2 mb-8 text-xs text-muted-foreground">Loading execution metrics…</p>
    <Panel title="Channels">
      <div className="flex flex-col gap-2 p-4">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-5 w-full animate-shimmer" />
        ))}
      </div>
    </Panel>
  </>
)

type Resource = {
  label: string
  description: string
  href: string
  icon: LucideIcon
  count: number | null
}

const ResourceLinks = ({ resources }: { resources: Resource[] }) => (
  <Panel title="Resources">
    <ul>
      {resources.map(({ label, description, href, icon: Icon, count }) => (
        <li key={label} className="border-b last:border-0">
          <Link
            href={href}
            className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40"
          >
            <div className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-muted/50 text-muted-foreground">
              <Icon className="size-4" />
            </div>
            <div className="min-w-0 grow">
              <div className="text-sm font-medium">{label}</div>
              <div className="truncate text-xs text-muted-foreground">{description}</div>
            </div>
            <span
              className="text-sm text-muted-foreground"
              title={count === null ? 'Unavailable' : undefined}
            >
              {count ?? '—'}
            </span>
            <ArrowRightIcon className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
          </Link>
        </li>
      ))}
    </ul>
  </Panel>
)

const SpaceOverviewPage = async ({ params }) => {
  const { orgId, spaceId } = await params

  const accessToken = await getAccessToken()
  if (!accessToken) return null

  const client = gruentClient(accessToken)
  const base = `/organizations/${orgId}/spaces/${spaceId}`

  const [space, connections, models, secrets] = await Promise.all([
    client.spaces.get(orgId, spaceId),
    client.connections.list(spaceId, { page: 1, resultsPerPage: 1 }),
    client.models.list(spaceId, { page: 1, resultsPerPage: 1 }),
    client.secrets.list(spaceId),
  ])

  const countOf = (response: { errors: string[] | null; totalResults?: number }) =>
    response.errors?.length ? null : (response.totalResults ?? null)

  const resources: Resource[] = [
    {
      label: 'Connections',
      description: 'Devices, APIs, databases and queues',
      href: `${base}/connections`,
      icon: WaypointsIcon,
      count: countOf(connections),
    },
    {
      label: 'Models',
      description: 'The structure of your data',
      href: `${base}/models`,
      icon: ShapesIcon,
      count: countOf(models),
    },
    {
      label: 'Secrets',
      description: 'Keys, passwords and tokens',
      href: `${base}/secrets`,
      icon: KeyRoundIcon,
      count: secrets.errors?.length || !secrets.data ? null : secrets.data.length,
    },
  ]

  return (
    <PageContent>
      <CreateChannelModal spaceId={spaceId} />
      <PageHeader
        icon={LayoutDashboardIcon}
        title="Overview"
        description={
          space.data?.name ? `How ${space.data.name} is running.` : 'How your space is running.'
        }
        actions={
          <OpenModalButton variant="outline" modalId="createChannel">
            <CirclePlusIcon />
            <span>Create channel</span>
          </OpenModalButton>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0">
          <Suspense fallback={<OverviewMetricsSkeleton />}>
            <OverviewMetrics accessToken={accessToken} orgId={orgId} spaceId={spaceId} />
          </Suspense>
        </div>
        <div>
          <ResourceLinks resources={resources} />
        </div>
      </div>
    </PageContent>
  )
}

export default SpaceOverviewPage
