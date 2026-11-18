'use client'

import nodeDefinitions from '@gruent/hub/lib/nodeDefinitions'
import type { Category, Definition, ManifestEntry } from '@gruent/libs/engine/nodes/ts'
import { Alert, AlertDescription, AlertTitle } from '@gruent/libs/frontend/components/core/alert'
import { useQuery } from '@tanstack/react-query'
import {
  ChevronRightIcon,
  CircleXIcon,
  LoaderCircleIcon,
  ScrollTextIcon,
  SearchIcon,
  XIcon,
} from 'lucide-react'
import { DragEvent, FC, useMemo, useState } from 'react'
import NodeLibrarySectionNode from './NodeLibrarySectionNode'

const CATEGORIES: Category[] = ['source', 'processing', 'conditional', 'action', 'custom']

type LibraryEntry = { entry: ManifestEntry; definition?: Definition; error?: string }

/** Every published definition. A definition that fails to load is listed with its error, not skipped. */
const loadLibrary = async (): Promise<LibraryEntry[]> => {
  nodeDefinitions.refresh()
  const { plugins } = await nodeDefinitions.manifest()
  const entries = await Promise.all(
    plugins.map(async (entry) => {
      try {
        return {
          entry,
          definition: await nodeDefinitions.resolve(entry.pluginType, entry.pluginVersion),
        }
      } catch (e) {
        return { entry, error: (e as Error).message }
      }
    }),
  )
  return entries.sort((a, b) =>
    a.entry.pluginType === b.entry.pluginType
      ? b.entry.pluginVersion - a.entry.pluginVersion
      : a.entry.pluginType.localeCompare(b.entry.pluginType),
  )
}

const matches = ({ entry, definition }: LibraryEntry, query: string) => {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return [
    entry.pluginType,
    definition?.document.displayName,
    definition?.document.description,
  ].some((s) => s?.toLowerCase().includes(q))
}

const NodeLibraryPane: FC = () => {
  const [searchQuery, setSearchQuery] = useState('')
  const [openSections, setOpenSections] = useState<Category[]>([])

  const {
    data: library,
    error,
    isLoading,
  } = useQuery({
    queryKey: ['nodeDefinitions'],
    queryFn: loadLibrary,
    retry: false,
  })

  const available = useMemo(
    () => (library ?? []).filter((e) => matches(e, searchQuery)),
    [library, searchQuery],
  )

  const toggleSection = (category: Category) =>
    setOpenSections((current) =>
      current.includes(category) ? current.filter((c) => c !== category) : [...current, category],
    )

  const handleNoteDragStart = (e: DragEvent<HTMLDivElement>) => {
    const defaultNoteValue = {
      id: '__GRUENT_NOTE__',
      coordinates: {
        x: 0,
        y: 0,
      },
      text: '',
    }
    e.dataTransfer.setData('application/json', JSON.stringify(defaultNoteValue))
  }

  return (
    <div className="flex flex-col w-full min-w-56 overflow-y-scroll overflow-x-hidden">
      <h2 className="uppercase text-gray-500 dark:text-gray-100 font-bold text-xs mb-2 pt-px">
        Nodes
      </h2>
      <div className="flex relative w-full items-bottom mb-2">
        <SearchIcon size=".875em" className="mr-1 text-gray-700" />
        <input
          name="nodeSearch"
          type="text"
          autoComplete="off"
          autoCorrect="off"
          spellCheck="false"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="outline-hidden border-0 border-b bg-transparent transition border-gray-400 hover:border-gray-800 focus:border-gray-800 text-xs mt-0 grow"
        />
        {searchQuery.length > 0 && (
          <XIcon
            size="1em"
            onClick={() => setSearchQuery('')}
            className="absolute right-0 t-1/2 cursor-pointer"
          />
        )}
      </div>

      {isLoading && (
        <p className="flex items-center gap-2 text-xs text-gray-500" role="status">
          <LoaderCircleIcon size="1em" className="animate-spin" /> Loading node library…
        </p>
      )}
      {error && (
        <Alert variant="destructive">
          <CircleXIcon />
          <AlertTitle>Could not load the node library</AlertTitle>
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      )}

      {CATEGORIES.map((category) => {
        const entries = available.filter((e) => e.entry.category === category)
        if (entries.length === 0) return null
        const open = openSections.includes(category) || available.length <= 5

        return (
          <section key={category}>
            <div
              className="flex items-center cursor-pointer select-none"
              onClick={() => toggleSection(category)}
            >
              <ChevronRightIcon
                size="1em"
                className={`mr-1 transition transform duration-200 ${open ? 'rotate-90 text-gray-700 dark:text-gray-500' : 'text-gray-600 dark:text-gray-400'}`}
              />
              <h3
                className={`transition text-sm font-semibold capitalize ${open ? 'text-gray-700' : ''}`}
              >
                {category}
              </h3>
            </div>
            {open && (
              <div>
                {entries.map(({ entry, definition, error }) =>
                  definition ? (
                    <NodeLibrarySectionNode key={definition.key} definition={definition} />
                  ) : (
                    <p
                      key={`${entry.pluginType}@${entry.pluginVersion}`}
                      className="my-1 text-xs text-destructive"
                      role="alert"
                    >
                      {entry.pluginType} v{entry.pluginVersion}: {error}
                    </p>
                  ),
                )}
              </div>
            )}
          </section>
        )
      })}

      <div className="grow" />
      <hr className="my-2" />
      <section>
        <div
          draggable
          className="my-1 px-1 select-none dark:text-gray-200 text-sm cursor-grab flex items-center"
          onDragStart={(e) => handleNoteDragStart(e)}
        >
          <ScrollTextIcon size="1em" className="mr-1" />
          <span>Note</span>
        </div>
      </section>
    </div>
  )
}

export default NodeLibraryPane
