import CreateSecretModal from '@gruent/hub/components/modals/CreateSecretModal'
import ListTablePlaceholder from '@gruent/hub/components/molecules/ListTablePlaceholder'
import PageHeader, { PageContent } from '@gruent/hub/components/molecules/PageHeader'
import SecretsTable from '@gruent/hub/components/organisms/SecretsTable'
import gruentClient from '@gruent/hub/lib/gruent'
import getAccessToken from '@gruent/hub/util/getAccessToken'
import { Alert, AlertDescription, AlertTitle } from '@gruent/libs/frontend/components/core/alert'
import OpenModalButton from '@gruent/libs/frontend/components/OpenModalButton'
import { CirclePlusIcon, CircleXIcon, KeyRoundIcon, LockIcon } from 'lucide-react'

export const metadata = {
  title: 'Secrets | GRUENT',
}

const SecretsPage = async ({ params }) => {
  const { spaceId } = await params

  const accessToken = await getAccessToken()
  if (!accessToken) return null

  const { data: secrets, errors } = await gruentClient(accessToken).secrets.list(spaceId)

  if (errors && errors.length > 0) {
    return (
      <div>
        <Alert variant="destructive" className="w-fit max-w-xl">
          <CircleXIcon />
          <AlertTitle>Could not list the secrets for this space</AlertTitle>
          <AlertDescription>{`${errors[0]}`}</AlertDescription>
        </Alert>
      </div>
    )
  }

  if (!secrets) {
    return (
      <div>
        <Alert variant="destructive" className="w-fit max-w-xl">
          <CircleXIcon />
          <AlertTitle>Could not list the secrets for this space</AlertTitle>
          <AlertDescription>{`The secrets could not be listed. Try logging out and logging back in.`}</AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <PageContent>
      <CreateSecretModal spaceId={spaceId} />
      <PageHeader
        icon={KeyRoundIcon}
        title="Secrets"
        description="Keys, passwords, tokens - anything that you need to stay private. Values are write-only and never shown again."
        actions={
          secrets.length > 0 && (
            <OpenModalButton variant="outline" modalId="addSecret">
              <CirclePlusIcon />
              <span>Create</span>
            </OpenModalButton>
          )
        }
      />
      {secrets.length > 0 && (
        <SecretsTable
          secrets={secrets}
          spaceId={spaceId}
          totalPages={Math.max(1, Math.ceil(secrets.length / 10))}
          totalResults={secrets.length}
        />
      )}
      {secrets.length <= 0 && (
        <ListTablePlaceholder
          hideTitle
          title="Secrets"
          description="Keys, passwords, tokens - anything that you need to stay private."
        >
          <LockIcon className="mb-2 size-10 text-muted-foreground" />
          <p className="mb-2 text-center text-muted-foreground">No secrets... yet!</p>
          <OpenModalButton modalId="addSecret">
            <CirclePlusIcon />
            <span>Create your first secret</span>
          </OpenModalButton>
        </ListTablePlaceholder>
      )}
    </PageContent>
  )
}

export default SecretsPage
