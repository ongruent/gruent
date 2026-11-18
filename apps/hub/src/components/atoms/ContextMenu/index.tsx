'use client'

import { FC, useMemo, useRef, useState } from 'react'
import { EllipsisVerticalIcon, type LucideIcon } from 'lucide-react'
import { useClickOutside } from '@react-hooks-library/core'

type ModifierKey = 'ctrl' | 'shift' | 'alt' | 'meta' | 'ctrlOrMeta'
// type ModifierSymbol = '^' | '⌘' | '⇧' | '⌥'

type ContextMenuButton = {
  icon?: LucideIcon
  title: string
  description?: string
  hotkey?: {
    modifiers: ModifierKey[]
    key: string
  }
  onClick: () => void
}

type ProcessedContextMenuButton = Omit<ContextMenuButton, 'hotkey'> & {
  hotkey?: {
    modifiers: string[]
    key: string
  }
}

type Props = {
  contextMenuButtons: ContextMenuButton[]
  iconSize?: string | number
}

const ContextMenu: FC<Props> = ({ contextMenuButtons, iconSize = '1em' }) => {
  const [open, setOpen] = useState<boolean>(false)

  const dropdownRef = useRef(null)
  useClickOutside(dropdownRef, () => {
    setOpen(false)
  })

  const toggleOpen = () => {
    setOpen((current) => !current)
  }

  // Determine if we should use meta (macOS) or ctrl (other OS)
  const isCtrlOrMeta = useMemo(() => {
    const isMac =
      // @ts-ignore - userAgentData is not yet in TypeScript's lib.dom
      navigator?.userAgentData?.platform?.toLowerCase().includes('mac') ??
      navigator.platform.toLowerCase().includes('mac')
    return isMac ? 'meta' : 'ctrl'
  }, [])

  // Apply ctrl or meta to the hotkey modifier list
  const processedButtons = useMemo<ProcessedContextMenuButton[]>(() => {
    return contextMenuButtons.map((button) => {
      if (!button || !button.hotkey) return button

      const updatedButton: ProcessedContextMenuButton = { ...button }
      if (updatedButton.hotkey) {
        updatedButton.hotkey = {
          ...updatedButton.hotkey,
          modifiers: updatedButton.hotkey.modifiers.map((modifier) => {
            if (modifier === 'ctrl') return '^'
            if (modifier === 'meta') return '⌘'
            if (modifier === 'shift') return '⇧'
            if (modifier === 'alt') return '⌥'
            if (modifier === 'ctrlOrMeta') return isCtrlOrMeta === 'meta' ? '⌘' : '^'
            return modifier
          }),
        }
      }

      return updatedButton
    })
  }, [contextMenuButtons, isCtrlOrMeta])

  return (
    <div className="relative flex justify-end">
      <EllipsisVerticalIcon size={iconSize} className="cursor-pointer" onClick={toggleOpen} />
      {open && (
        <div
          ref={dropdownRef}
          className="absolute flex flex-col gap-1 p-2 cursor-pointer bg-white dark:bg-gray-800 top-6 right-0 select-none border border-gray-300 dark:border-gray-700 rounded z-30 w-fit max-w-56 shadow-[3px_3px_6px_0_rgba(0,0,0,0.03)]"
        >
          {processedButtons.map((contextMenuButton) => (
            <div
              key={contextMenuButton.title}
              className="group/button relative w-full min-w-[175px] px-2 py-1 text-left transition border border-transparent rounded text-sm hover:bg-green-50 hover:border-green-300 dark:hover:bg-gray-700 dark:hover:border-gray-600"
              onClick={() => {
                contextMenuButton.onClick()
                setOpen(false)
              }}
            >
              {contextMenuButton.hotkey && (
                <div className="absolute top-1 pt-0.5 right-2 text-gray-500 text-xs group-hover/button:text-green-800 dark:group-hover/button:text-green-300">
                  <p>
                    {contextMenuButton.hotkey.modifiers.join('') + contextMenuButton.hotkey.key}
                  </p>
                </div>
              )}
              <p className="flex items-center text-sm font-semibold text-gray-600 dark:text-gray-200 group-hover/button:text-green-800 dark:group-hover/button:text-green-300">
                {contextMenuButton.icon && <contextMenuButton.icon size="1em" className="mr-1" />}
                {contextMenuButton.title}
              </p>
              {contextMenuButton.description && (
                <p className="text-gray-500 leading-3 group-hover/button:text-green-800 dark:group-hover/button:text-green-300">
                  <small>{contextMenuButton.description}</small>
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default ContextMenu
