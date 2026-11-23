import useAuth from '@gruent/hub/hooks/useAuth'
import gruentClient from '@gruent/hub/lib/gruent'
import {
  type ModelAttribute,
  modelFieldLabel,
  modelFields,
  type NamedOptionState,
  type NamedOptions,
  type Option,
  type OptionsEvent,
} from '@gruent/libs/engine/steps/ts'
import type { ApiResponse } from '@gruent/libs/gruent-js/src/response'
import { type QueryClient, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

const PAGE_SIZE = 20
const STALE_TIME = 30_000

type Page = { items: Option[]; hasMore: boolean }

/** A named collection of resources the editor can offer as select options. Values are always identifiers. */
type NamedSource = {
  list: (request: { query: string; params: Record<string, unknown>; page: number }) => Promise<Page>
  /**
   * Resolves a saved identifier independently of the current page or search, with the parameters of the
   * field's current request. null if it does not exist.
   */
  get: (id: string, params: Record<string, unknown>) => Promise<Option | null>
}

const unwrap = <T>({ data, errors }: ApiResponse<T>): T => {
  if (errors && errors.length > 0) throw new Error(errors[0])
  if (data === null) throw new Error('Empty response')
  return data
}

const hasMore = (res: ApiResponse<unknown[]>, page: number) =>
  res.totalPages ? page < res.totalPages : (res.data?.length ?? 0) >= PAGE_SIZE

const sourcesFor = (
  accessToken: string,
  spaceId: string,
  queryClient: QueryClient,
): Record<string, NamedSource> => {
  const client = gruentClient(accessToken)
  const toOption = (r: { id: string; name: string }): Option => ({ value: r.id, label: r.name })

  // Fields of the model selected in another configuration field (params.model), as paths relative to the
  // input. params.scalars limits them to single strings, numbers and booleans.
  const fieldsOf = async (params: Record<string, unknown>) => {
    if (typeof params.model !== 'string' || params.model === '') return []
    const modelId = params.model
    const model = await queryClient.fetchQuery({
      queryKey: ['nodeOptionModel', spaceId, modelId],
      queryFn: async () => unwrap(await client.models.get(spaceId, modelId)),
      staleTime: STALE_TIME,
      retry: false,
    })
    const attributes = model.attributes as Record<string, ModelAttribute> | null
    return modelFields(attributes, { scalars: params.scalars === true }).map(
      (f): Option => ({ value: f.path, label: modelFieldLabel(f) }),
    )
  }

  // Secret names are the identifiers. Only names ever reach the browser, never secret values.
  const secretNames = async () => unwrap(await client.secrets.list(spaceId)).map((s) => s.name)

  return {
    models: {
      list: async ({ query, page }) => {
        const res = await client.models.list(spaceId, {
          page,
          resultsPerPage: PAGE_SIZE,
          filter: query || undefined,
        })
        return { items: unwrap(res).map(toOption), hasMore: hasMore(res, page) }
      },
      get: async (id) => {
        const res = await client.models.get(spaceId, id)
        return res.data ? toOption(res.data) : null
      },
    },
    connections: {
      list: async ({ query, params, page }) => {
        const res = await client.connections.list(spaceId, {
          page,
          resultsPerPage: PAGE_SIZE,
          filter: query || undefined,
          category: typeof params.category === 'string' ? params.category : undefined,
        })
        return { items: unwrap(res).map(toOption), hasMore: hasMore(res, page) }
      },
      get: async (id) => {
        const res = await client.connections.get(spaceId, id)
        return res.data ? toOption(res.data) : null
      },
    },
    secrets: {
      list: async ({ query }) => {
        const q = query.trim().toLowerCase()
        const names = (await secretNames()).filter((n) => n.toLowerCase().includes(q))
        return { items: names.map((n) => ({ value: n, label: n })), hasMore: false }
      },
      get: async (id) => ((await secretNames()).includes(id) ? { value: id, label: id } : null),
    },
    'model-fields': {
      list: async ({ query, params }) => {
        const q = query.trim().toLowerCase()
        const items = (await fieldsOf(params)).filter((o) => o.value.toLowerCase().includes(q))
        return { items, hasMore: false }
      },
      get: async (id, params) => (await fieldsOf(params)).find((o) => o.value === id) ?? null,
    },
  }
}

type Current = OptionsEvent & { key: string; page: number; token: number }

const requestKey = ({ name, query, params }: OptionsEvent) => JSON.stringify([name, query, params])

const savedIds = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((v): v is string => typeof v === 'string')
    : typeof value === 'string'
      ? [value]
      : []

/**
 * Parent-side state for <NodeConfig /> named options: fetching with the user's credentials, search, pagination,
 * caching, stale-response handling and resolution of saved identifiers. State is keyed by field path, so two
 * fields using the same collection are independent.
 */
const useNamedOptions = (spaceId: string, config: Record<string, unknown>) => {
  const { accessToken } = useAuth()
  const queryClient = useQueryClient()
  const sources = useMemo(
    () => sourcesFor(accessToken ?? '', spaceId, queryClient),
    [accessToken, spaceId, queryClient],
  )
  const [namedOptions, setNamedOptions] = useState<NamedOptions>({})
  const current = useRef(new Map<string, Current>())
  const resolved = useRef(new Set<string>())

  const update = (path: string, fn: (prev: NamedOptionState) => NamedOptionState) =>
    setNamedOptions((all) => ({
      ...all,
      [path]: fn(
        all[path] ?? { items: [], selectedItems: [], query: '', loading: false, hasMore: false },
      ),
    }))

  const load = useCallback(
    async (request: OptionsEvent, page: number) => {
      const { path, name, query, params } = request
      const token = (current.current.get(path)?.token ?? 0) + 1
      current.current.set(path, { ...request, key: requestKey(request), page, token })
      // A new query or new dependency values resets the accumulated items; saved values are untouched.
      update(path, (prev) => ({
        ...prev,
        items: page === 1 ? [] : prev.items,
        hasMore: page === 1 ? false : prev.hasMore,
        query,
        loading: true,
        error: undefined,
      }))

      try {
        const source = sources[name]
        if (!source) throw new Error(`Unknown option source "${name}"`)
        const result = await queryClient.fetchQuery({
          queryKey: ['nodeOptions', spaceId, name, query, params, page],
          queryFn: () => source.list({ query, params, page }),
          staleTime: STALE_TIME,
          retry: false,
        })
        if (current.current.get(path)?.token !== token) return // a newer request superseded this one
        update(path, (prev) => ({
          ...prev,
          items: page === 1 ? result.items : [...prev.items, ...result.items],
          hasMore: result.hasMore,
          loading: false,
        }))
      } catch (e) {
        if (current.current.get(path)?.token !== token) return
        // Keep whatever was already loaded; static options are rendered regardless.
        update(path, (prev) => ({ ...prev, loading: false, error: (e as Error).message }))
      }
    },
    [queryClient, sources, spaceId],
  )

  const onOptionsSearch = useCallback(
    (request: OptionsEvent) => {
      const prev = current.current.get(request.path)
      const failed = !!namedOptions[request.path]?.error
      if (prev && prev.key === requestKey(request) && !failed) return
      // Retry saved-identifier lookups that may have failed transiently.
      for (const k of [...resolved.current])
        if (k.startsWith(`${request.path}\u0000`)) resolved.current.delete(k)
      load(request, 1)
    },
    [load, namedOptions],
  )

  const onOptionsLoadMore = useCallback(
    (request: OptionsEvent) => {
      const prev = current.current.get(request.path)
      load(request, prev && prev.key === requestKey(request) ? prev.page + 1 : 1)
    },
    [load],
  )

  // Resolve saved identifiers that are not in the loaded results. Unknown ones are left unresolved so the
  // renderer shows them as unavailable; they are never removed from the configuration.
  useEffect(() => {
    for (const [path, { name, params }] of current.current) {
      const source = sources[name]
      if (!source) continue
      const state = namedOptions[path]
      const known = new Set(
        [...(state?.selectedItems ?? []), ...(state?.items ?? [])].map((o) => o.value),
      )
      for (const id of savedIds(config[path.slice(1)])) {
        const key = `${path}\u0000${name}\u0000${JSON.stringify(params)}\u0000${id}`
        if (known.has(id) || resolved.current.has(key)) continue
        resolved.current.add(key)
        queryClient
          .fetchQuery({
            queryKey: ['nodeOptionSelected', spaceId, name, params, id],
            queryFn: () => source.get(id, params),
            staleTime: STALE_TIME,
            retry: false,
          })
          .then((option) => {
            if (!option) return
            update(path, (prev) =>
              prev.selectedItems.some((o) => o.value === option.value)
                ? prev
                : { ...prev, selectedItems: [...prev.selectedItems, option] },
            )
          })
          .catch(() => undefined) // shown as unavailable; retried on the next search
      }
    }
  }, [config, namedOptions, queryClient, sources, spaceId])

  return { namedOptions, onOptionsSearch, onOptionsLoadMore }
}

export default useNamedOptions
