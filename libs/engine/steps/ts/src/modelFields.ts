/**
 * Field paths of a stored model, for field pickers (the `modelFields` named option collection). Mirrors the
 * controller's model types (types.FromModel) and variables (types.Variables), so every path offered here is
 * one the controller accepts.
 */

/** An attribute of a stored model, as kept in the model's attributes (keyed by attribute ID). */
export type ModelAttribute = {
  id?: string
  key: string
  type: string
  subtype?: string
  arrayObjectAttributes?: Record<string, ModelAttribute>
  parentId?: string
  required?: boolean
}

export type FieldKind = 'object' | 'array' | 'string' | 'number' | 'boolean'

/**
 * A field of a model: its path relative to the input ("device.id", "readings[].value"), its kind, and whether
 * it and every object on the way are required (array items count as present).
 */
export type ModelField = { path: string; kind: FieldKind; required: boolean }

/** A payload type resolved by the controller (types.Type), e.g. a step's input in compile results. */
export type ResolvedType = {
  kind: string
  fields?: { name: string; type: ResolvedType; required?: boolean }[]
  items?: ResolvedType
}

type Node = { kind: FieldKind; fields?: [string, Node, boolean][]; items?: Node }

// Same bound as the controller's variables, so deeply nested models list the same paths.
const MAX_DEPTH = 8

const withIds = (attributes: Record<string, ModelAttribute>): ModelAttribute[] =>
  Object.entries(attributes).map(([id, a]) => ({ ...a, id: a.id || id }))

function objectOf(all: ModelAttribute[], parentId: string): Node {
  const fields = all
    .filter((a) => (a.parentId ?? '') === parentId)
    .map((a): [string, Node, boolean] | undefined => {
      const node = typeOf(all, a)
      return node ? [a.key, node, !!a.required] : undefined
    })
    .filter((f): f is [string, Node, boolean] => !!f)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return { kind: 'object', fields }
}

function typeOf(all: ModelAttribute[], a: ModelAttribute): Node | undefined {
  switch (a.type) {
    case 'string':
    case 'number':
    case 'boolean':
      return { kind: a.type }
    case 'object':
      return objectOf(all, a.id ?? '')
    case 'array': {
      if (a.subtype === 'string' || a.subtype === 'number' || a.subtype === 'boolean')
        return { kind: 'array', items: { kind: a.subtype } }
      if (a.subtype !== 'object') return undefined // the controller rejects the model
      const children = withIds(a.arrayObjectAttributes ?? {}).map((c) =>
        c.parentId === a.id ? { ...c, parentId: '' } : c,
      )
      return { kind: 'array', items: objectOf(children, '') }
    }
    default:
      return undefined
  }
}

const SCALARS: FieldKind[] = ['string', 'number', 'boolean']

/**
 * Lists the fields of a model in path order, including objects and arrays themselves. With `scalars`, only
 * single values are listed: strings, numbers and booleans that are not inside an array.
 */
export function modelFields(
  attributes: Record<string, ModelAttribute> | null | undefined,
  options: { scalars?: boolean } = {},
): ModelField[] {
  return fieldsOf(objectOf(withIds(attributes ?? {}), ''), options)
}

const KINDS: FieldKind[] = ['object', 'array', 'string', 'number', 'boolean']

function nodeOf(t: ResolvedType): Node | undefined {
  if (!KINDS.includes(t.kind as FieldKind)) return undefined
  const kind = t.kind as FieldKind
  if (kind === 'object')
    return {
      kind,
      fields: (t.fields ?? [])
        .map((f): [string, Node, boolean] | undefined => {
          const node = nodeOf(f.type)
          return node ? [f.name, node, !!f.required] : undefined
        })
        .filter((f): f is [string, Node, boolean] => !!f),
    }
  if (kind === 'array') return { kind, items: t.items ? nodeOf(t.items) : undefined }
  return { kind }
}

/**
 * Lists the fields of a resolved type like modelFields. Types without fields (opaque bytes, signals, single
 * values) have none.
 */
export function typeFields(type: ResolvedType | null | undefined, options: { scalars?: boolean } = {}): ModelField[] {
  const node = type ? nodeOf(type) : undefined
  return node ? fieldsOf(node, options) : []
}

function fieldsOf(root: Node, options: { scalars?: boolean }): ModelField[] {
  const out: ModelField[] = []
  const walk = (prefix: string, node: Node, required: boolean, depth: number) => {
    if (depth >= MAX_DEPTH) return
    if (node.kind === 'object') {
      for (const [name, child, childRequired] of node.fields ?? []) {
        const path = prefix ? `${prefix}.${name}` : name
        out.push({ path, kind: child.kind, required: required && childRequired })
        walk(path, child, required && childRequired, depth + 1)
      }
    } else if (node.kind === 'array' && node.items) {
      const path = `${prefix}[]`
      out.push({ path, kind: node.items.kind, required })
      walk(path, node.items, required, depth + 1)
    }
  }
  walk('', root, true, 0)
  return options.scalars ? out.filter((f) => SCALARS.includes(f.kind) && !f.path.includes('[]')) : out
}

/** Option label for a field, e.g. "device.id (string)" or "message (string, required)". */
export const modelFieldLabel = (field: Pick<ModelField, 'path' | 'kind'> & { required?: boolean }) =>
  `${field.path} (${field.kind}${field.required ? ', required' : ''})`
