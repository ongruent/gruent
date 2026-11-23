'use client'

import nodeDefinitions from '@gruent/hub/lib/nodeDefinitions'
import useChannelEditorStore from '@gruent/hub/stores/channelEditorStore'
import type { Category, Definition, ManifestEntry } from '@gruent/libs/engine/steps/ts'
import { Alert, AlertDescription, AlertTitle } from '@gruent/libs/frontend/components/core/alert'
import { Button } from '@gruent/libs/frontend/components/core/button'
import { Input } from '@gruent/libs/frontend/components/core/input'
import { useQuery } from '@tanstack/react-query'
import { cn } from 'cn'
import {
  ChevronRightIcon,
  CircleXIcon,
  GripVerticalIcon,
  LoaderCircleIcon,
  PanelLeftCloseIcon,
  SearchIcon,
  SearchXIcon,
  StickyNoteIcon,
  XIcon,
} from 'lucide-react'
import { DragEvent, FC, useMemo, useState } from 'react'
import { StepTypeIcon } from '../flow/stepIcons'
import { stepCategoryStyle } from '../flow/stepStyles'
import { pluginIdentity } from '../pluginNodes'
import StepLibrarySectionStep from './StepLibrarySectionStep'

/** Steps that answer the request of an HTTP source, listed only for channels that have one. */
const HTTP_SOURCE_ONLY = ['http-response']

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

type Props = {
  onClose?: () => void
}

const StepLibraryPane: FC<Props> = ({ onClose }) => {
  const [searchQuery, setSearchQuery] = useState('')
  const [collapsedSections, setCollapsedSections] = useState<Category[]>([])

  const {
    data: library,
    error,
    isLoading,
  } = useQuery({
    queryKey: ['nodeDefinitions'],
    queryFn: loadLibrary,
    retry: false,
  })

  const steps = useChannelEditorStore((state) => state.steps)
  const hasHttpSource = useMemo(
    () =>
      Array.from(steps.values()).some((step) => pluginIdentity(step)?.pluginType === 'http-source'),
    [steps],
  )
  const available = useMemo(
    () =>
      (library ?? []).filter(
        (e) =>
          matches(e, searchQuery) &&
          (hasHttpSource || !HTTP_SOURCE_ONLY.includes(e.entry.pluginType)),
      ),
    [library, searchQuery, hasHttpSource],
  )
  const isSearching = searchQuery.trim().length > 0

  const toggleSection = (category: Category) =>
    setCollapsedSections((current) =>
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
    <div className="flex h-full w-full flex-col" data-testid="step-library">
      <div className="flex items-start gap-2 px-4 pt-4 pb-3">
        <div className="min-w-0 grow">
          <h2 className="text-sm font-semibold">Steps</h2>
          <p className="text-xs text-muted-foreground">Drag a step onto the canvas</p>
        </div>
        {onClose && (
          <Button
            variant="ghost"
            size="icon-sm"
            className="-mt-1 -mr-2 text-muted-foreground"
            aria-label="Hide step library"
            title="Hide step library"
            onClick={onClose}
          >
            <PanelLeftCloseIcon />
          </Button>
        )}
      </div>
      <div className="px-4 pb-3">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            name="stepSearch"
            type="text"
            placeholder="Search steps"
            aria-label="Search steps"
            autoComplete="off"
            autoCorrect="off"
            spellCheck="false"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 pr-8 pl-8"
          />
          {isSearching && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setSearchQuery('')}
              className="absolute top-1/2 right-2.5 flex -translate-y-1/2 cursor-pointer items-center text-muted-foreground transition-colors hover:text-foreground"
            >
              <XIcon className="size-4" />
            </button>
          )}
        </div>
      </div>

      <div className="min-h-0 grow overflow-y-auto px-2 pb-2">
        {isLoading && (
          <p
            className="flex items-center gap-2 px-2 py-2 text-xs text-muted-foreground"
            role="status"
          >
            <LoaderCircleIcon className="size-4 animate-spin" /> Loading step library…
          </p>
        )}
        {error && (
          <Alert variant="destructive" className="mx-2 w-auto">
            <CircleXIcon />
            <AlertTitle>Could not load the step library</AlertTitle>
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        )}
        {library && available.length === 0 && (
          <div className="flex flex-col items-center gap-1 px-4 py-8 text-center">
            <SearchXIcon className="mb-1 size-5 text-muted-foreground" />
            <p className="text-sm font-medium">No matching steps</p>
            <p className="text-xs text-muted-foreground">Try a different name or description.</p>
          </div>
        )}

        {CATEGORIES.map((category) => {
          const entries = available.filter((e) => e.entry.category === category)
          if (entries.length === 0) return null
          const open = isSearching || !collapsedSections.includes(category)
          const style = stepCategoryStyle(category)

          return (
            <section key={category} className="mb-1">
              <button
                type="button"
                aria-expanded={open}
                onClick={() => toggleSection(category)}
                className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left select-none transition-colors hover:bg-accent"
              >
                <ChevronRightIcon
                  className={cn(
                    'size-3.5 text-muted-foreground transition-transform duration-200',
                    open && 'rotate-90',
                  )}
                />
                <span
                  className={cn('flex size-4 items-center justify-center rounded-sm', style.chip)}
                >
                  <StepTypeIcon type={category} className="size-2.5" />
                </span>
                <h3 className="grow text-xs font-medium">{style.label}</h3>
                <span className="text-xs text-muted-foreground tabular-nums">{entries.length}</span>
              </button>
              {open && (
                <div className="flex flex-col gap-0.5 py-1">
                  {entries.map(({ entry, definition, error }) =>
                    definition ? (
                      <StepLibrarySectionStep key={definition.key} definition={definition} />
                    ) : (
                      <p
                        key={`${entry.pluginType}@${entry.pluginVersion}`}
                        className="mx-2 my-1 rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1.5 text-xs text-destructive"
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
      </div>

      <div className="border-t p-2">
        <div
          draggable
          onDragStart={(e) => handleNoteDragStart(e)}
          title="Drag a note onto the canvas"
          className="group flex cursor-grab items-center gap-3 rounded-md border border-transparent px-2 py-2 select-none transition-colors hover:border-border hover:bg-card hover:shadow-xs active:cursor-grabbing"
          data-testid="step-library-note"
        >
          <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-400">
            <StickyNoteIcon className="size-4" />
          </div>
          <div className="min-w-0 grow">
            <h4 className="text-sm leading-5 font-medium">Note</h4>
            <p className="text-xs leading-4 text-muted-foreground">Annotate the canvas</p>
          </div>
          <GripVerticalIcon className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
        </div>
      </div>
    </div>
  )
}

export default StepLibraryPane
