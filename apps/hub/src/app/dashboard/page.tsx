import CreateOrganizationModal from '@gruent/hub/components/modals/CreateOrganizationModal'
import PageHeader, { PageContent } from '@gruent/hub/components/molecules/PageHeader'
import gruentClient from '@gruent/hub/lib/gruent'
import getAccessToken, { getSession } from '@gruent/hub/util/getAccessToken'
import { Alert, AlertDescription, AlertTitle } from '@gruent/libs/frontend/components/core/alert'
import OpenModalButton from '@gruent/libs/frontend/components/OpenModalButton'
import { ArrowRightIcon, CirclePlusIcon, CircleXIcon, HouseIcon } from 'lucide-react'
import Link from 'next/link'
export const metadata = {
  title: 'Dashboard | Gruent',
}

const DashboardPage = async () => {
  const accessToken = await getAccessToken()
  const { userId } = await getSession(accessToken)

  if (!accessToken || !userId) return null

  const { data: user, errors } = await gruentClient(accessToken).users.get(userId)

  if (errors && errors.length > 0) {
    return (
      <div>
        <Alert variant="destructive" className="w-fit max-w-xl">
          <CircleXIcon />
          <AlertTitle>Could not retrieve the user details</AlertTitle>
          <AlertDescription>{`${errors[0]}`}</AlertDescription>
        </Alert>
      </div>
    )
  }

  if (!user) {
    return (
      <div>
        <Alert variant="destructive" className="w-fit max-w-xl">
          <CircleXIcon />
          <AlertTitle>User not found</AlertTitle>
          <AlertDescription>{`This user does not exist. Try logging out and logging back in.`}</AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <PageContent>
      <CreateOrganizationModal />
      <PageHeader
        icon={HouseIcon}
        title="Welcome to Gruent"
        description="Pick an organization to get to its spaces."
        actions={
          <OpenModalButton variant="outline" modalId="createOrganization">
            <CirclePlusIcon />
            <span>Create</span>
          </OpenModalButton>
        }
      />
      <section id="spaces">
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Organizations</h2>
        {user.organizations && user.organizations.length > 0 && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {user.organizations.map((organizationMembership) => {
              const { organization } = organizationMembership
              return (
                <Link
                  key={organization.id}
                  className="spaceCard group flex items-center gap-3 rounded-lg border bg-card p-4 transition-colors hover:bg-muted/40"
                  href={`/organizations/${organization.id}`}
                >
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-muted/50 text-sm font-semibold text-muted-foreground">
                    {organization.name.slice(0, 1).toUpperCase()}
                  </div>
                  <span className="truncate font-medium">{organization.name}</span>
                  <div className="grow" />
                  <ArrowRightIcon className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </Link>
              )
            })}
          </div>
        )}
        {(!user.organizations || user.organizations.length <= 0) && (
          <p className="text-sm text-muted-foreground">
            You're not a member of any organizations... yet!
          </p>
        )}
      </section>
    </PageContent>
  )
}

export default DashboardPage
