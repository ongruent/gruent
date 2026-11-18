'use client'

import {
  type FieldModel,
  type NamedOptionState,
  namedParams,
  type Option,
  type OptionsEvent,
  selectedOptions,
  visibleOptions,
} from '@gruent/libs/engine/nodes/ts'
import { Badge } from '@gruent/libs/frontend/components/core/badge'
import { Button } from '@gruent/libs/frontend/components/core/button'
import { Input } from '@gruent/libs/frontend/components/core/input'
import { cn } from 'cn'
import {
  CheckIcon,
  ChevronDownIcon,
  LoaderCircleIcon,
  TriangleAlertIcon,
  XIcon,
} from 'lucide-react'
import { FC, useEffect, useMemo, useRef, useState } from 'react'

type Props = {
  id: string
  field: FieldModel
  /** The full configuration, used to derive declarative named-source parameters. */
  config: Record<string, unknown>
  value: unknown
  state?: NamedOptionState
  invalid: boolean
  onChange: (value: unknown) => void
  onOptionsSearch: (request: OptionsEvent) => void
  onOptionsLoadMore: (request: OptionsEvent) => void
}

const matches = (option: Option, query: string) => {
  const q = query.trim().toLowerCase()
  return !q || option.label.toLowerCase().includes(q) || option.value.toLowerCase().includes(q)
}

/**
 * Select and multiselect for static-only, named-only and mixed option sources. Static entries are always
 * listed first and stay available while named results load or fail. Named data is owned by the parent: this
 * control only emits search and load-more requests.
 */
const OptionsSelect: FC<Props> = ({
  id,
  field,
  config,
  value,
  state,
  invalid,
  onChange,
  onOptionsSearch,
  onOptionsLoadMore,
}) => {
  const multiple = field.schema['x-ui'].control === 'multiselect'
  const named = field.schema['x-ui'].options?.named
  const statics = field.schema['x-ui'].options?.static ?? []
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState(state?.query ?? '')

  // Parameters are derived declaratively from other fields; serialize them to detect dependency changes.
  const params = useMemo(() => (named ? namedParams(named, config) : {}), [named, config])
  const paramsKey = JSON.stringify(params)

  const latest = useRef({ query, params, onOptionsSearch })
  latest.current = { query, params, onOptionsSearch }

  // Ask the parent for option state when the field appears and whenever its dependencies change. The parent
  // decides whether to fetch, reuse cached data or resolve saved selections; saved values are never touched.
  useEffect(() => {
    if (!named) return
    const { query, params, onOptionsSearch } = latest.current
    onOptionsSearch({ path: field.path, name: named.name, query, params })
  }, [named, field.path, paramsKey])

  const selected = selectedOptions(field, value, state)
  const selectedValues = new Set(selected.map((o) => o.value))
  const staticValues = new Set(statics.map((o) => o.value))
  // Named items are already filtered by the parent; static entries are filtered locally.
  const options = visibleOptions(field, state).filter(
    (o) => !staticValues.has(o.value) || matches(o, query),
  )

  const search = (q: string) => {
    setQuery(q)
    if (named) onOptionsSearch({ path: field.path, name: named.name, query: q, params })
  }

  const choose = (option: Option) => {
    if (option.disabled) return
    if (!multiple) {
      onChange(option.value)
      setOpen(false)
      return
    }
    const current = Array.isArray(value) ? (value as unknown[]) : []
    const next = selectedValues.has(option.value)
      ? current.filter((v) => v !== option.value)
      : [...current, option.value]
    onChange(next.length > 0 ? next : undefined)
  }

  const remove = (v: string) => {
    if (!multiple) return onChange(undefined)
    const next = (Array.isArray(value) ? (value as unknown[]) : []).filter((x) => x !== v)
    onChange(next.length > 0 ? next : undefined)
  }

  const listId = `${id}-options`

  return (
    <div className="flex flex-col gap-2" data-testid={`node-config-select-${field.path}`}>
      <div
        className={cn(
          'flex min-h-9 w-full items-center gap-1 rounded-md border border-input bg-transparent px-2 py-1 text-sm shadow-xs dark:bg-input/30',
          invalid && 'border-destructive',
        )}
      >
        <div className="flex grow flex-wrap items-center gap-1">
          {selected.length === 0 && (
            <span className="text-muted-foreground">
              {field.schema['x-ui'].placeholder ?? 'Select…'}
            </span>
          )}
          {selected.map((option) => {
            const label = (
              <span className={cn('truncate', option.unavailable && 'text-destructive')}>
                {option.unavailable && (
                  <TriangleAlertIcon className="mr-1 inline size-3" aria-hidden />
                )}
                {option.label}
              </span>
            )
            const removable = multiple || !field.required
            return multiple ? (
              <Badge
                key={option.value}
                variant={option.unavailable ? 'outline' : 'secondary'}
                className={cn(option.unavailable && 'border-destructive')}
                data-value={option.value}
              >
                {label}
                {removable && (
                  <button
                    type="button"
                    aria-label={`Remove ${option.label}`}
                    onClick={() => remove(option.value)}
                    className="ml-1"
                  >
                    <XIcon className="size-3" />
                  </button>
                )}
              </Badge>
            ) : (
              <span
                key={option.value}
                className="flex items-center gap-1"
                data-value={option.value}
              >
                {label}
                {removable && (
                  <button
                    type="button"
                    aria-label="Clear selection"
                    onClick={() => remove(option.value)}
                  >
                    <XIcon className="size-3 text-muted-foreground" />
                  </button>
                )}
              </span>
            )
          })}
        </div>
        <Button
          id={id}
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
          aria-label={
            open ? `Close ${field.schema.title} options` : `Open ${field.schema.title} options`
          }
          aria-expanded={open}
          aria-controls={listId}
          aria-invalid={invalid}
          onClick={() => setOpen((o) => !o)}
        >
          <ChevronDownIcon className={cn('transition', open && 'rotate-180')} />
        </Button>
      </div>

      {open && (
        <div className="flex flex-col gap-1 rounded-md border border-input p-1">
          <Input
            aria-label={`Search ${field.schema.title}`}
            placeholder="Search…"
            value={query}
            onChange={(e) => search(e.target.value)}
            className="h-8"
          />
          <div
            id={listId}
            role="listbox"
            aria-multiselectable={multiple}
            aria-label={field.schema.title}
            className="max-h-60 overflow-y-auto"
          >
            {options.map((option) => {
              const isSelected = selectedValues.has(option.value)
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  aria-disabled={option.disabled}
                  disabled={option.disabled}
                  onClick={() => choose(option)}
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent disabled:opacity-50"
                >
                  <CheckIcon
                    className={cn('size-4 shrink-0', !isSelected && 'invisible')}
                    aria-hidden
                  />
                  <span className="truncate">{option.label}</span>
                </button>
              )
            })}
            {options.length === 0 && !state?.loading && (
              <p className="px-2 py-1.5 text-sm text-muted-foreground">No options</p>
            )}
            {state?.loading && (
              <p
                className="flex items-center gap-2 px-2 py-1.5 text-sm text-muted-foreground"
                role="status"
              >
                <LoaderCircleIcon className="size-4 animate-spin" aria-hidden />
                Loading…
              </p>
            )}
            {state?.error && (
              <p className="px-2 py-1.5 text-sm text-destructive" role="alert">
                {state.error}
              </p>
            )}
          </div>
          {named && state?.hasMore && !state.loading && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() =>
                onOptionsLoadMore({ path: field.path, name: named.name, query, params })
              }
            >
              Load more
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

export default OptionsSelect
