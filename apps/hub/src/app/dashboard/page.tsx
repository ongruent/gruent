import CreateOrganizationModal from '@gruent/hub/components/modals/CreateOrganizationModal'
import { ArrowRightIcon, CirclePlusIcon, CircleXIcon } from 'lucide-react'
import Link from 'next/link'
import gruentClient from '@gruent/hub/lib/gruent'
import getAccessToken, { getSession } from '@gruent/hub/util/getAccessToken'
import OpenModalButton from '@gruent/libs/frontend/components/OpenModalButton'
import { Alert, AlertDescription, AlertTitle } from '@gruent/libs/frontend/components/core/alert'
export const metadata = {
  title: 'Dashboard | GRUENT',
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
    <div>
      <CreateOrganizationModal />
      <h1 className="text-2xl mb-6">Welcome to GRUENT</h1>
      <section id="spaces">
        <div className="flex items-end mb-4">
          <div>
            <h2>Organizations</h2>
            <p>
              <small>Collaborate with your team across spaces.</small>
            </p>
          </div>
          <div className="grow" />
          <OpenModalButton variant="outline" modalId="createOrganization">
            <CirclePlusIcon />
            <span>Create</span>
          </OpenModalButton>
        </div>
        {user.organizations && user.organizations.length > 0 && (
          <div className="grid grid-cols-3 gap-8">
            {user.organizations.map((organizationMembership) => {
              return (
                <Link
                  key={organizationMembership.organization.id}
                  className="spaceCard"
                  href={`/organizations/${organizationMembership.organization.id}`}
                >
                  <div className="flex px-4 py-6 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 transition rounded-md">
                    <h2>{organizationMembership.organization.name}</h2>
                    <div className="grow" />
                    <ArrowRightIcon size="1em" className="text-gray-600" />
                  </div>
                </Link>
              )
            })}
          </div>
        )}
        {(!user.organizations || user.organizations.length <= 0) && (
          <p>You're not a member of any organizations... yet!</p>
        )}
      </section>
    </div>
  )
}

export default DashboardPage
