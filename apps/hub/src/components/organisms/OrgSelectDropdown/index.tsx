'use client'

import { Button } from '@gruent/libs/frontend/components/core/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@gruent/libs/frontend/components/core/dropdown-menu'
import { openModal } from '@gruent/libs/frontend/hooks/useModal'
import { Organization } from '@prisma/client'
import { CheckIcon, ChevronDownIcon, PlusIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { FC } from 'react'
import CreateOrganizationModal from '../../modals/CreateOrganizationModal'

type Props = {
  organizations: Organization[]
  currentOrg?: Organization
}

const OrgSelectDropdown: FC<Props> = ({ organizations, currentOrg }) => {
  const router = useRouter()

  const handleChangeOrg = (id: string) => {
    router.push(`/organizations/${id}`)
  }

  return (
    <>
      <CreateOrganizationModal />
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="px-2 font-semibold hover:bg-sidebar-accent">
            {currentOrg?.name ?? 'No organizations found!'}
            <ChevronDownIcon className="text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-60">
          {organizations.map((org) => {
            const { name: orgName, id: orgId } = org
            const isCurrent = orgId === currentOrg?.id

            return (
              <DropdownMenuItem key={orgId} onSelect={() => handleChangeOrg(orgId)}>
                {orgName}
                {isCurrent && <CheckIcon className="ml-auto" />}
              </DropdownMenuItem>
            )
          })}
          {organizations.length > 0 && <DropdownMenuSeparator />}
          <DropdownMenuItem onSelect={() => openModal('createOrganization')}>
            <PlusIcon /> Create a new org
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}

export default OrgSelectDropdown
