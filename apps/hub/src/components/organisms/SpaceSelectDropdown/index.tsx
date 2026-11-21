'use client'

import { CheckIcon, ChevronDownIcon, PlusIcon } from 'lucide-react'
import { Organization, Space } from '@prisma/client'
import { FC, useMemo } from 'react'
import CreateSpaceModal from '@gruent/hub/components/modals/CreateSpaceModal'
import { Button } from '@gruent/libs/frontend/components/core/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@gruent/libs/frontend/components/core/dropdown-menu'
import { openModal } from '@gruent/libs/frontend/hooks/useModal'
import Link from 'next/link'

type Props = {
  organization?: Organization & { spaces: Space[] }
  currentSpaceId: string
}

const SpaceSelectDropDown: FC<Props> = ({ organization, currentSpaceId }) => {
  const currentSpace = useMemo(() => {
    if (!organization?.spaces || organization.spaces.length <= 0) return

    // get the current space from the users array
    const cs = organization.spaces.filter((space) => {
      if (space.id === currentSpaceId) return true
      return false
    })

    if (cs.length > 0) return cs[0]
    return organization.spaces[0]
  }, [organization?.spaces, currentSpaceId])

  if (!organization) return <p className="text-gray-700 dark:text-gray-300 font-semibold">Error</p>

  if (!currentSpace) return <p>No spaces were found!</p>

  return (
    <>
      <CreateSpaceModal orgId={organization.id} />
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="-ml-3 font-semibold">
            {currentSpace.name}
            <ChevronDownIcon className="text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-60">
          {organization.spaces.map((space) => {
            const { name: spaceName, id: spaceId } = space

            if (spaceId === currentSpaceId)
              return (
                <DropdownMenuItem key={spaceId}>
                  {spaceName}
                  <CheckIcon className="ml-auto" />
                </DropdownMenuItem>
              )

            return (
              <DropdownMenuItem key={spaceId} asChild>
                <Link href={`/organizations/${organization.id}/spaces/${spaceId}`}>
                  {spaceName}
                </Link>
              </DropdownMenuItem>
            )
          })}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => openModal('createSpace')}>
            <PlusIcon /> Create a new space
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}

export default SpaceSelectDropDown
