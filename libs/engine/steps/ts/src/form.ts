/**
 * Headless model for a metadata-driven <StepConfig /> renderer. The renderer never fetches: the parent owns
 * named option data (fetching, auth, search, pagination, caching, stale-response handling) and passes it in as
 * NamedOptions keyed by field path; the renderer only emits search/load-more events.
 */
import type { Condition, Definition, FieldSchema, Group, Issue, NamedOptionsSource, Option, Scalar } from './contract'

export type NamedOptionState = {
  /** Accumulated results for the current query; the parent resets them when query or params change. */
  items: Option[]
  /** Saved selections resolved independently of the current page of results. */
  selectedItems: Option[]
  query: string
  loading: boolean
  error?: string
  hasMore: boolean
}

/** Option state keyed by field JSON Pointer, so two fields using the same collection search independently. */
export type NamedOptions = Record<string, NamedOptionState>

export type OptionsEvent = { path: string; name: string; query: string; params: Record<string, unknown> }

export type FieldModel = {
  name: string
  /** JSON Pointer of the field in the configuration; also the NamedOptions key. */
  path: string
  required: boolean
  schema: FieldSchema
}

export type Section = { group?: Group; fields: FieldModel[] }

/** Ordered sections: ungrouped fields first, then groups in declaration order; fields by x-ui.order. */
export function describeForm(def: Definition): Section[] {
  const schema = def.document.configSchema
  const required = new Set(schema.required ?? [])
  const fields = Object.entries(schema.properties)
    .map(([name, s]) => ({ name, path: `/${name}`, required: required.has(name), schema: s }))
    .sort((a, b) => a.schema['x-ui'].order - b.schema['x-ui'].order)
  const sections: Section[] = [{ fields: fields.filter((f) => !f.schema['x-ui'].group) }]
  for (const group of schema['x-ui']?.groups ?? []) {
    sections.push({ group, fields: fields.filter((f) => f.schema['x-ui'].group === group.id) })
  }
  return sections.filter((s) => s.fields.length > 0)
}

const valueAt = (config: Record<string, unknown>, pointer: string) => config[pointer.slice(1)]

/**
 * Declarative visibility. Hidden fields keep their values and are still validated. Conditions of row fields
 * are evaluated against the row.
 */
export function isVisible(condition: Condition | undefined, config: Record<string, unknown>): boolean {
  if (!condition) return true
  const v = valueAt(config, condition.field) as Scalar | undefined
  return condition.in ? condition.in.includes(v as Scalar) : v === condition.equals
}

/** Parameters for a named source: constants plus values of the fields named by paramsFromFields. */
export function namedParams(named: NamedOptionsSource, config: Record<string, unknown>): Record<string, unknown> {
  const params: Record<string, unknown> = { ...(named.params ?? {}) }
  for (const [k, ptr] of Object.entries(named.paramsFromFields ?? {})) {
    const v = valueAt(config, ptr)
    if (v !== undefined) params[k] = v
  }
  return params
}

/** Builds onOptionsSearch / onOptionsLoadMore payloads. Pagination cursors stay with the parent. */
export function optionsEvent(field: FieldModel, config: Record<string, unknown>, query: string): OptionsEvent | undefined {
  const named = field.schema['x-ui'].options?.named
  if (!named) return undefined
  return { path: field.path, name: named.name, query, params: namedParams(named, config) }
}

/**
 * Options to display: static entries first (always available, even while loading or after an error), then
 * named items. Values share one namespace; duplicates are shown once and the static label wins.
 */
export function visibleOptions(field: FieldModel, state?: NamedOptionState): Option[] {
  const statics = field.schema['x-ui'].options?.static ?? []
  const seen = new Set(statics.map((o) => o.value))
  return [...statics, ...(state?.items ?? []).filter((o) => !seen.has(o.value) && seen.add(o.value))]
}

export type SelectedOption = Option & { unavailable?: boolean }

/**
 * Labels for saved values. A value missing from the current page is not invalid; unknown values are kept
 * with an "unavailable" label instead of being cleared.
 */
export function selectedOptions(field: FieldModel, value: unknown, state?: NamedOptionState): SelectedOption[] {
  const values = Array.isArray(value) ? (value as string[]) : typeof value === 'string' ? [value] : []
  const statics = field.schema['x-ui'].options?.static ?? []
  return values.map((v) => {
    const known =
      statics.find((o) => o.value === v) ??
      state?.selectedItems.find((o) => o.value === v) ??
      state?.items.find((o) => o.value === v)
    return known ?? { value: v, label: `${v} (unavailable)`, unavailable: true }
  })
}

/** Whether a field is shown: both its section's group and the field itself must be visible. */
export function isFieldVisible(section: Section, field: FieldModel, config: Record<string, unknown>): boolean {
  return isVisible(section.group?.visibleWhen, config) && isVisible(field.schema['x-ui'].visibleWhen, config)
}

/** Validation issues that belong to a field: its own pointer and, for arrays, its item pointers. */
export function fieldIssues(field: FieldModel, issues: Issue[]): Issue[] {
  return issues.filter((i) => i.path === field.path || i.path.startsWith(`${field.path}/`))
}

/**
 * Returns a copy of the configuration with one field changed. `undefined` removes the key, which is how an
 * optional field is cleared (null is never valid). Every other key, including unknown or hidden ones, is kept.
 */
export function withField(config: Record<string, unknown>, name: string, value: unknown): Record<string, unknown> {
  const next = { ...config }
  if (value === undefined) delete next[name]
  else next[name] = value
  return next
}

/**
 * Fields of one row of an objectList field, ordered by x-ui.order. Paths point into the row
 * (`/rows/0/left`), so option state and validation issues are per row; names are the row's keys.
 */
export function describeItem(field: FieldModel, index: number): FieldModel[] {
  const items = field.schema.items
  if (items?.type !== 'object') return []
  const required = new Set(items.required ?? [])
  return Object.entries(items.properties ?? {})
    .map(([name, schema]) => ({
      name,
      path: `${field.path}/${index}/${name}`,
      required: required.has(name),
      schema,
    }))
    .sort((a, b) => a.schema['x-ui'].order - b.schema['x-ui'].order)
}

/** Value at a JSON Pointer, e.g. `/rows/0/left`. undefined if any step is missing. */
export function valueAtPointer(value: unknown, pointer: string): unknown {
  let current = value
  for (const token of pointer.split('/').slice(1)) {
    const key = token.replace(/~1/g, '/').replace(/~0/g, '~')
    if (Array.isArray(current)) current = current[Number(key)]
    else if (current && typeof current === 'object') current = (current as Record<string, unknown>)[key]
    else return undefined
  }
  return current
}

/**
 * For an objectList with x-ui.keyField: the options request of the key field. It is keyed by the list's
 * pointer (`/mappings`), since the key's options decide which rows the list has.
 */
export function keyOptionsEvent(field: FieldModel, config: Record<string, unknown>, query = ''): OptionsEvent | undefined {
  const key = field.schema['x-ui'].keyField
  const named = key ? field.schema.items?.properties?.[key]?.['x-ui'].options?.named : undefined
  if (!named) return undefined
  return { path: field.path, name: named.name, query, params: namedParams(named, config) }
}

/**
 * Updates the row of a keyed objectList whose key field is `key`, appending it if it is new. A row left
 * with only its key is removed, so unmapped keys are never saved. `undefined` removes the list.
 */
export function withKeyedRow(
  rows: unknown,
  keyField: string,
  key: string,
  row: Record<string, unknown>,
): Record<string, unknown>[] | undefined {
  const list = (Array.isArray(rows) ? rows : []) as Record<string, unknown>[]
  const index = list.findIndex((r) => r?.[keyField] === key)
  const empty = Object.entries(row).every(([k, v]) => k === keyField || v === undefined)
  const next = { ...row, [keyField]: key }
  const out =
    index < 0
      ? empty
        ? list
        : [...list, next]
      : empty
        ? list.filter((_, i) => i !== index)
        : list.map((r, i) => (i === index ? next : r))
  return out.length > 0 ? out : undefined
}
