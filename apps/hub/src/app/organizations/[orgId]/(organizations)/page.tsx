import CreateSpaceModal from '@gruent/hub/components/modals/CreateSpaceModal'
import { ArrowRightIcon, CirclePlusIcon, CircleXIcon } from 'lucide-react'
import Link from 'next/link'
import gruentClient from '@gruent/hub/lib/gruent'
import getAccessToken, { getSession } from '@gruent/hub/util/getAccessToken'
import OpenModalButton from '@gruent/libs/frontend/components/OpenModalButton'
import { Alert, AlertDescription, AlertTitle } from '@gruent/libs/frontend/components/core/alert'
export const metadata = {
  title: 'Organization spaces | GRUENT',
}

const DashboardPage = async ({ params }) => {
  const accessToken = await getAccessToken()
  const { userId } = await getSession(accessToken)
  if (!accessToken || !userId) return null

  const { orgId } = await params

  const { data: organization, errors } = await gruentClient(accessToken).organizations.get(orgId)

  if (errors && errors.length > 0) {
    return (
      <div className="mt-4 px-8 py-2">
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
      <div className="mt-4 px-8 py-2">
        <Alert variant="destructive" className="w-fit max-w-xl">
          <CircleXIcon />
          <AlertTitle>Organization not found</AlertTitle>
          <AlertDescription>{`This organization does not exist. Try logging out and logging back in.`}</AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <>
      <CreateSpaceModal orgId={orgId} />
      <h1 className="text-2xl mb-6">{organization?.name}</h1>
      <section id="spaces">
        <div className="flex items-end mb-4">
          <div>
            <h2>Spaces</h2>
            <p>
              <small>Manage channels, things, data, and more.</small>
            </p>
          </div>
          <div className="grow" />
          <OpenModalButton variant="outline" modalId="createSpace">
            <CirclePlusIcon />
            <span>Create</span>
          </OpenModalButton>
        </div>
        {organization.spaces && organization.spaces.length > 0 && (
          <div className="grid grid-cols-3 gap-8">
            {organization.spaces.map((space) => {
              return (
                <Link
                  key={space.id}
                  className="spaceCard"
                  href={`/organizations/${orgId}/spaces/${space.id}`}
                >
                  <div className="flex px-4 py-6 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 transition rounded-md">
                    <h2>{space.name}</h2>
                    <div className="grow" />
                    <ArrowRightIcon size="1em" className="text-gray-600" />
                  </div>
                </Link>
              )
            })}
          </div>
        )}
        {(!organization.spaces || organization.spaces.length <= 0) && (
          <p>This organization has no spaces... yet!</p>
        )}
      </section>
    </>
  )
}

export default DashboardPage
