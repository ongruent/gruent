import CreateSpaceModal from '@gruent/hub/components/modals/CreateSpaceModal'
import PageHeader, { PageContent } from '@gruent/hub/components/molecules/PageHeader'
import gruentClient from '@gruent/hub/lib/gruent'
import getAccessToken, { getSession } from '@gruent/hub/util/getAccessToken'
import { Alert, AlertDescription, AlertTitle } from '@gruent/libs/frontend/components/core/alert'
import OpenModalButton from '@gruent/libs/frontend/components/OpenModalButton'
import { ArrowRightIcon, CirclePlusIcon, CircleXIcon, LayersIcon } from 'lucide-react'
import Link from 'next/link'
export const metadata = {
  title: 'Organization spaces | Gruent',
}

const DashboardPage = async ({ params }) => {
  const accessToken = await getAccessToken()
  const { userId } = await getSession(accessToken)
  if (!accessToken || !userId) return null

  const { orgId } = await params

  const { data: organization, errors } = await gruentClient(accessToken).organizations.get(orgId)

  if (errors && errors.length > 0) {
    return (
      <div>
        <Alert variant="destructive" className="w-fit max-w-xl">
          <CircleXIcon />
          <AlertTitle>Could not get the organization details</AlertTitle>
          <AlertDescription>{`${errors[0]}`}</AlertDescription>
        </Alert>
      </div>
    )
  }

  if (!organization) {
    return (
      <div>
        <Alert variant="destructive" className="w-fit max-w-xl">
          <CircleXIcon />
          <AlertTitle>Organization not found</AlertTitle>
          <AlertDescription>{`This organization does not exist. Try logging out and logging back in.`}</AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <PageContent>
      <CreateSpaceModal orgId={orgId} />
      <PageHeader
        icon={LayersIcon}
        title={organization.name}
        description="Spaces hold your channels, connections, models and secrets."
        actions={
          <OpenModalButton variant="outline" modalId="createSpace">
            <CirclePlusIcon />
            <span>Create</span>
          </OpenModalButton>
        }
      />
      <section id="spaces">
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Spaces</h2>
        {organization.spaces && organization.spaces.length > 0 && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {organization.spaces.map((space) => {
              return (
                <Link
                  key={space.id}
                  className="spaceCard group flex items-center gap-3 rounded-lg border bg-card p-4 transition-colors hover:bg-muted/40"
                  href={`/organizations/${orgId}/spaces/${space.id}`}
                >
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-muted/50 text-muted-foreground">
                    <LayersIcon className="size-4" />
                  </div>
                  <span className="truncate font-medium">{space.name}</span>
                  <div className="grow" />
                  <ArrowRightIcon className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </Link>
              )
            })}
          </div>
        )}
        {(!organization.spaces || organization.spaces.length <= 0) && (
          <p className="text-sm text-muted-foreground">This organization has no spaces... yet!</p>
        )}
      </section>
    </PageContent>
  )
}

export default DashboardPage
