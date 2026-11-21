'use client'

import { signout } from '@gruent/hub/actions/auth'
import useSettingsStore, { Theme } from '@gruent/hub/stores/settingsStore'
import { Button } from '@gruent/libs/frontend/components/core/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@gruent/libs/frontend/components/core/dropdown-menu'
import { ChevronDownIcon, LogOutIcon, MoonIcon, SunIcon, UserIcon } from 'lucide-react'
import Link from 'next/link'
import { FC } from 'react'

type Props = {
  userId: string
}

const UserMenu: FC<Props> = ({ userId }) => {
  const theme = useSettingsStore((state) => state.theme)
  const setTheme = useSettingsStore((state) => state.setTheme)
  const isDark = theme === Theme.dark

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="text-muted-foreground">
          <span className="flex size-5 items-center justify-center rounded-full bg-muted text-foreground">
            <UserIcon className="size-3" />
          </span>
          <span>Profile</span>
          <ChevronDownIcon className="size-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-52">
        <DropdownMenuItem asChild>
          <Link href={`/profiles/${userId}`}>
            <UserIcon />
            Profile & preferences
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setTheme(isDark ? Theme.light : Theme.dark)}>
          {isDark ? <SunIcon /> : <MoonIcon />}
          {isDark ? 'Light theme' : 'Dark theme'}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => signout()}>
          <LogOutIcon />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default UserMenu
