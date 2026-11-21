'use client'

import useSettingsStore from '@gruent/hub/stores/settingsStore'
import { Button } from '@gruent/libs/frontend/components/core/button'
import { cn } from 'cn'
import { type LucideIcon, PanelLeftCloseIcon, PanelLeftOpenIcon } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { FC } from 'react'

export type SidebarItem = {
  /** DOM id, kept stable for tests (e.g. `spaceSettings`). */
  id: string
  href: string
  label: string
  icon: LucideIcon
  /** Only mark the item active on an exact path match (for section home pages). */
  exact?: boolean
  /** Extra path prefixes that also mark the item active. */
  activePrefixes?: string[]
}

export type SidebarSection = {
  label?: string
  items: SidebarItem[]
}

type Props = {
  id?: string
  /** Accessible name of the navigation. */
  label: string
  sections: SidebarSection[]
}

const isActive = (pathname: string, item: SidebarItem) => {
  const matches = (prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  if (item.exact) return pathname === item.href || (item.activePrefixes ?? []).some(matches)
  return matches(item.href) || (item.activePrefixes ?? []).some(matches)
}

/**
 * Collapsible, labelled section navigation. Collapsing keeps the icons (with tooltips) and is remembered
 * in the user's settings.
 */
const Sidebar: FC<Props> = ({ id, label, sections }) => {
  const pathname = usePathname()
  const collapsed = useSettingsStore((state) => state.sidebarCollapsed)
  const setCollapsed = useSettingsStore((state) => state.setSidebarCollapsed)

  return (
    <aside
      id={id}
      data-collapsed={collapsed}
      className={cn(
        'flex shrink-0 flex-col pb-3 transition-[width] duration-200',
        collapsed ? 'w-14' : 'w-56',
      )}
    >
      <nav aria-label={label} className="flex grow flex-col gap-4 overflow-y-auto px-2 pt-2">
        {sections.map((section, sectionIndex) => (
          <div key={section.label ?? sectionIndex} className="flex flex-col gap-0.5">
            {section.label &&
              (collapsed ? (
                sectionIndex > 0 && <div className="mx-2 mb-1 border-t border-sidebar-border" />
              ) : (
                <div className="px-2 pb-1 text-xs font-medium text-muted-foreground">
                  {section.label}
                </div>
              ))}
            <ul className="flex flex-col gap-0.5">
              {section.items.map((item) => {
                const active = isActive(pathname, item)
                const Icon = item.icon

                return (
                  <li key={item.id} id={item.id}>
                    <Link
                      href={item.href}
                      title={collapsed ? item.label : undefined}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex h-8 items-center gap-2.5 rounded-md px-2 text-sm transition-colors',
                        active
                          ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground'
                          : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground',
                        collapsed && 'justify-center px-0',
                      )}
                    >
                      <Icon className="size-4 shrink-0" />
                      <span className={cn('truncate', collapsed && 'sr-only')}>{item.label}</span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className={cn('px-2', collapsed && 'flex justify-center')}>
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? <PanelLeftOpenIcon /> : <PanelLeftCloseIcon />}
        </Button>
      </div>
    </aside>
  )
}

export default Sidebar
