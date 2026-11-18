/**
 * TypeScript consumer of the node contract (v1). Definitions are read as their original JSON documents:
 * there are no per-plugin types, generated schemas or static registries. Configuration is validated with
 * Ajv against the definition's own configSchema, using the same rules as the Go consumer.
 */
import Ajv2020, { type ErrorObject, type ValidateFunction } from 'ajv/dist/2020'

import envelopeSchema from '../../contracts/v1/node-definition.schema.json'

export const CONTRACT_VERSION = 1

export type Category = 'source' | 'processing' | 'action' | 'conditional' | 'custom'
export type FieldType = 'string' | 'number' | 'integer' | 'boolean' | 'array'
export type Scalar = string | number | boolean
export type Control =
  | 'text'
  | 'textarea'
  | 'select'
  | 'datetime'
  | 'number'
  | 'toggle'
  | 'multiselect'
  | 'list'

export type Option = { value: string; label: string; disabled?: boolean }
export type NamedOptionsSource = {
  name: string
  params?: Record<string, Scalar>
  paramsFromFields?: Record<string, string>
}
export type OptionsSource = { static?: Option[]; named?: NamedOptionsSource }
export type Condition = { field: string; equals?: Scalar; in?: Scalar[] }

export type FieldUi = {
  control: Control
  order: number
  group?: string
  placeholder?: string
  step?: number
  visibleWhen?: Condition
  options?: OptionsSource
}

export type ItemSchema = {
  type: 'string' | 'number' | 'integer'
  minLength?: number
  maxLength?: number
  pattern?: string
  enum?: string[]
  minimum?: number
  maximum?: number
  exclusiveMinimum?: number
  exclusiveMaximum?: number
}

export type FieldSchema = Omit<ItemSchema, 'type'> & {
  type: FieldType
  title: string
  description?: string
  format?: 'date-time'
  items?: ItemSchema
  minItems?: number
  maxItems?: number
  uniqueItems?: boolean
  default?: unknown
  'x-ui': FieldUi
}

export type Group = { id: string; title: string; description?: string; visibleWhen?: Condition }

export type ConfigSchema = {
  $schema: string
  type: 'object'
  additionalProperties: false
  title?: string
  description?: string
  required?: string[]
  properties: Record<string, FieldSchema>
  'x-ui'?: { groups?: Group[] }
}

export type NodeDefinition = {
  contractVersion: 1
  pluginType: string
  pluginVersion: number
  displayName: string
  description: string
  category: Category
  io: { inputs: Category[]; outputs: Category[] }
  configSchema: ConfigSchema
}

/** A validation problem. path is a JSON Pointer into the validated document. */
export type Issue = { path: string; message: string }

export class DefinitionError extends Error {
  constructor(readonly issues: Issue[]) {
    super(`invalid node definition:\n  ${issues.map((i) => `${i.path || '(root)'}: ${i.message}`).join('\n  ')}`)
  }
}

export const identityKey = (pluginType: string, pluginVersion: number) => `${pluginType}@${pluginVersion}`

const escapePointer = (s: string) => s.replace(/~/g, '~0').replace(/\//g, '~1')

const DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d+)?(Z|[+-](\d{2}):(\d{2}))$/

/**
 * The contract's date-time profile: RFC 3339 with an upper-case "T", mandatory seconds, optional fraction and
 * "Z" or ±hh:mm. Leap seconds are rejected. Identical in Go and Kotlin.
 */
export function isDateTime(s: string): boolean {
  const m = DATE_TIME.exec(s)
  if (!m) return false
  const n = (i: number) => Number(m[i])
  const [year, month, day] = [n(1), n(2), n(3)]
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const days = month === 2 ? (leap ? 29 : 28) : [4, 6, 9, 11].includes(month) ? 30 : 31
  if (month < 1 || month > 12 || day < 1 || day > days) return false
  if (n(4) > 23 || n(5) > 59 || n(6) > 59) return false
  if (m[8] !== 'Z' && (n(9) > 23 || n(10) > 59)) return false
  return true
}

// No loadSchema is configured, so schemas can never trigger remote fetching.
const envelopeAjv = new Ajv2020({ allErrors: true, strict: false })
const validateEnvelope = envelopeAjv.compile(envelopeSchema)

const configAjv = new Ajv2020({ allErrors: true, strict: true, strictTypes: false })
configAjv.addKeyword('x-ui') // rendering annotation; never affects validity
configAjv.addFormat('date-time', isDateTime)

function normalize(errors: ErrorObject[] | null | undefined): Issue[] {
  const out = new Map<string, Issue>()
  for (const e of errors ?? []) {
    if (e.keyword === 'if') continue // wrapper around the failing "then" errors
    let path = e.instancePath
    if (e.keyword === 'required') path += `/${escapePointer(e.params.missingProperty)}`
    else if (e.keyword === 'additionalProperties') path += `/${escapePointer(e.params.additionalProperty)}`
    const message =
      e.keyword === 'required' ? 'is required' : e.keyword === 'additionalProperties' ? 'is not allowed' : (e.message ?? e.keyword)
    out.set(`${path}\u0000${message}`, { path, message })
  }
  return [...out.values()].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
}

/** Hex SHA-256 digest in the "sha256:<hex>" form used by the manifest, Go and Kotlin. */
export async function digest(bytes: Uint8Array): Promise<string> {
  const buf = await globalThis.crypto.subtle.digest('SHA-256', bytes as BufferSource)
  return `sha256:${Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('')}`
}

/** A validated definition plus its compiled configuration validator. */
export class Definition {
  private constructor(
    readonly document: NodeDefinition,
    readonly digest: string,
    private readonly validator: ValidateFunction,
  ) {}

  get pluginType() {
    return this.document.pluginType
  }

  get pluginVersion() {
    return this.document.pluginVersion
  }

  get key() {
    return identityKey(this.pluginType, this.pluginVersion)
  }

  /** Validates the original definition bytes. Throws DefinitionError with every issue found. */
  static async parse(source: string | Uint8Array): Promise<Definition> {
    const bytes = typeof source === 'string' ? new TextEncoder().encode(source) : source
    const text = new TextDecoder().decode(bytes)
    let doc: unknown
    try {
      doc = JSON.parse(text)
    } catch (e) {
      throw new DefinitionError([{ path: '', message: `invalid JSON: ${(e as Error).message}` }])
    }
    const d = await digest(bytes)
    return Definition.fromDocument(doc, d)
  }

  static fromDocument(doc: unknown, documentDigest: string): Definition {
    if (!validateEnvelope(doc)) throw new DefinitionError(normalize(validateEnvelope.errors))
    const def = doc as NodeDefinition
    const issues = checkSemantics(def)
    let validator: ValidateFunction | undefined
    if (issues.length === 0) {
      validator = cachedValidator(documentDigest, def.configSchema)
      issues.push(...checkDefaults(def, validator))
    }
    if (issues.length > 0 || !validator) throw new DefinitionError(issues)
    return new Definition(def, documentDigest, validator)
  }

  /** Validates configuration shape. Resource references and permissions are checked by the backend. */
  validateConfig(config: unknown): Issue[] {
    return this.validator(config) ? [] : normalize(this.validator.errors)
  }

  /** Initial configuration for a new node: declared defaults only. Editors never apply defaults. */
  createConfig(): Record<string, unknown> {
    const out: Record<string, unknown> = {}
    for (const [name, f] of Object.entries(this.document.configSchema.properties)) {
      if (f.default !== undefined) out[name] = structuredClone(f.default)
    }
    return out
  }
}

const validatorCache = new Map<string, ValidateFunction>()

function cachedValidator(key: string, schema: ConfigSchema): ValidateFunction {
  let v = validatorCache.get(key)
  if (!v) {
    v = configAjv.compile(schema)
    validatorCache.set(key, v)
  }
  return v
}

const KOTLIN_KEYWORDS = new Set(
  'as break class continue do else false for fun if in interface is null object package return super this throw true try typealias typeof val var when while'.split(
    ' ',
  ),
)

/** Same scan as the Go consumer: only "(?:" groups after "(?", and no backreferences. */
function unportablePattern(p: string): string | undefined {
  for (let i = 0; i < p.length; i++) {
    if (p[i] === '\\') {
      if (/[1-9k]/.test(p[i + 1] ?? '')) return 'backreferences are not supported'
      i++
    } else if (p[i] === '(' && p[i + 1] === '?' && p[i + 2] !== ':') {
      return 'only (?: groups are supported (no lookaround, named groups or inline flags)'
    }
  }
  try {
    new RegExp(p, 'u')
  } catch (e) {
    return `pattern does not compile: ${(e as Error).message}`
  }
  return undefined
}

/** Cross-field contract rules, mirroring libs/engine/nodes/semantic.go. */
function checkSemantics(def: NodeDefinition): Issue[] {
  const issues: Issue[] = []
  const add = (path: string, message: string) => issues.push({ path, message })
  const schema = def.configSchema
  const props = schema.properties
  const prop = (name: string, ...rest: string[]) =>
    ['/configSchema/properties', escapePointer(name), ...rest].join('/')

  if (def.category === 'source' && def.io.inputs.length > 0) add('/io/inputs', 'source plugins cannot accept inputs')
  if (def.category !== 'source' && def.io.inputs.length === 0)
    add('/io/inputs', `${def.category} plugins must accept at least one input category`)

  ;(schema.required ?? []).forEach((r, i) => {
    if (!props[r]) add(`/configSchema/required/${i}`, `required field "${r}" is not declared in properties`)
  })

  const fieldOf = (pointer: string) => props[pointer.slice(1)]
  const checkCondition = (path: string, c: Condition, self?: string): FieldSchema | undefined => {
    const name = c.field.slice(1)
    const target = props[name]
    if (!target) return void add(`${path}/field`, `field ${c.field} does not exist`)
    if (name === self) return void add(`${path}/field`, 'a field cannot depend on itself')
    if (target.type === 'array') return void add(`${path}/field`, `conditions cannot reference array field ${c.field}`)
    const values = c.in ?? [c.equals as Scalar]
    const matches = (v: Scalar) =>
      typeof v === 'string'
        ? target.type === 'string'
        : typeof v === 'boolean'
          ? target.type === 'boolean'
          : target.type === 'number' || (target.type === 'integer' && Number.isInteger(v))
    if (!values.every(matches))
      add(c.in ? `${path}/in` : `${path}/equals`, `value cannot match ${target.type} field ${c.field}`)
    return target
  }

  const groups = new Map<string, Group>()
  ;(schema['x-ui']?.groups ?? []).forEach((g, i) => {
    if (groups.has(g.id)) add(`/configSchema/x-ui/groups/${i}/id`, `duplicate group id "${g.id}"`)
    else groups.set(g.id, g)
  })
  ;(schema['x-ui']?.groups ?? []).forEach((g, i) => {
    if (!g.visibleWhen) return
    const path = `/configSchema/x-ui/groups/${i}/visibleWhen`
    const target = checkCondition(path, g.visibleWhen)
    if (target && target['x-ui'].group === g.id)
      add(`${path}/field`, `group "${g.id}" cannot depend on its own field ${g.visibleWhen.field}`)
  })

  const orders = new Map<number, string>()
  for (const name of Object.keys(props).sort()) {
    const f = props[name]
    const ui = f['x-ui']
    const uiPath = prop(name, 'x-ui')
    if (KOTLIN_KEYWORDS.has(name)) add(prop(name), `field name "${name}" is a reserved word in generated Kotlin`)
    const other = orders.get(ui.order)
    if (other !== undefined) add(`${uiPath}/order`, `order ${ui.order} is already used by field "${other}"`)
    else orders.set(ui.order, name)
    if (ui.group && !groups.has(ui.group)) add(`${uiPath}/group`, `group "${ui.group}" is not declared`)
    if (ui.visibleWhen) checkCondition(`${uiPath}/visibleWhen`, ui.visibleWhen, name)

    if (f.type === 'string') {
      if ((ui.control === 'datetime') !== (f.format === 'date-time'))
        add(`${uiPath}/control`, 'format "date-time" and control "datetime" must be used together')
      if (f.enum && ui.control !== 'select')
        add(prop(name, 'enum'), 'enum is only supported on select fields with static options')
    }

    if (ui.options) {
      const isArray = f.type === 'array'
      const enumPath = isArray ? prop(name, 'items', 'enum') : prop(name, 'enum')
      const enumValues = isArray ? f.items?.enum : f.enum
      if (isArray && f.items?.type !== 'string') add(prop(name, 'items', 'type'), 'multiselect values must be strings')
      const optPath = `${uiPath}/options`
      const statics = ui.options.static ?? []
      const seen = new Set<string>()
      statics.forEach((s, i) => {
        if (seen.has(s.value)) add(`${optPath}/static/${i}/value`, `duplicate static option value "${s.value}"`)
        seen.add(s.value)
      })
      const named = ui.options.named
      if (named) {
        if (enumValues?.length) add(enumPath, 'selects with named options must not declare enum')
        for (const k of Object.keys(named.paramsFromFields ?? {}).sort()) {
          const ptr = named.paramsFromFields![k]
          const p = `${optPath}/named/paramsFromFields/${k}`
          if (!fieldOf(ptr)) add(p, `field ${ptr} does not exist`)
          else if (ptr.slice(1) === name) add(p, 'a field cannot derive parameters from itself')
          if (named.params && k in named.params) add(p, `parameter "${k}" is declared in both params and paramsFromFields`)
        }
      } else if (enumValues?.length) {
        const enumSet = new Set(enumValues)
        if (enumValues.some((e) => !seen.has(e)) || statics.some((s) => !enumSet.has(s.value)))
          add(enumPath, 'enum must match the static option values')
      }
    } else if (f.type === 'array' && f.items?.enum?.length) {
      add(prop(name, 'items', 'enum'), 'enum on array items requires the multiselect control with static options')
    }

    const checkRange = (base: string, s: Omit<ItemSchema, 'type'>) => {
      if (s.minimum !== undefined && s.exclusiveMinimum !== undefined)
        add(`${base}/exclusiveMinimum`, 'declare either minimum or exclusiveMinimum, not both')
      if (s.maximum !== undefined && s.exclusiveMaximum !== undefined)
        add(`${base}/exclusiveMaximum`, 'declare either maximum or exclusiveMaximum, not both')
      const lo = s.minimum ?? s.exclusiveMinimum
      const hi = s.maximum ?? s.exclusiveMaximum
      if (lo !== undefined && hi !== undefined && lo > hi) add(`${base}/maximum`, `maximum ${hi} is less than minimum ${lo}`)
      if (s.minLength !== undefined && s.maxLength !== undefined && s.minLength > s.maxLength)
        add(`${base}/maxLength`, 'is less than minLength')
      if (s.pattern) {
        const msg = unportablePattern(s.pattern)
        if (msg) add(`${base}/pattern`, `pattern is not portable across RE2, ECMAScript and Java: ${msg}`)
      }
    }
    checkRange(prop(name), f)
    if (f.minItems !== undefined && f.maxItems !== undefined && f.minItems > f.maxItems)
      add(prop(name, 'maxItems'), 'is less than minItems')
    if (f.items) checkRange(prop(name, 'items'), f.items)
  }
  return issues
}

function checkDefaults(def: NodeDefinition, validator: ValidateFunction): Issue[] {
  const defaults: Record<string, unknown> = {}
  for (const [name, f] of Object.entries(def.configSchema.properties)) {
    if (f.default !== undefined) defaults[name] = f.default
  }
  if (validator(defaults)) return []
  return normalize(validator.errors)
    .filter((i) => i.path.split('/')[1] in defaults)
    .map((i) => ({
      path: `/configSchema/properties/${i.path.split('/')[1]}/default`,
      message: `default ${i.message}`,
    }))
}

/**
 * Resolves exact plugin identities to definitions loaded at runtime (from the API, a package or the
 * manifest). Unknown versions are errors; there is no "latest" and no fallback.
 */
export class DefinitionRegistry {
  private readonly entries = new Map<string, Definition>()

  async register(source: string | Uint8Array): Promise<Definition> {
    const def = await Definition.parse(source)
    const prev = this.entries.get(def.key)
    if (prev && prev.digest !== def.digest)
      throw new Error(`${def.key}: already registered with a different definition (${prev.digest})`)
    this.entries.set(def.key, prev ?? def)
    return prev ?? def
  }

  resolve(pluginType: string, pluginVersion: number): Definition {
    const def = this.entries.get(identityKey(pluginType, pluginVersion))
    if (!def) throw new Error(`${identityKey(pluginType, pluginVersion)}: plugin version not available`)
    return def
  }

  keys(): string[] {
    return [...this.entries.keys()].sort()
  }
}
