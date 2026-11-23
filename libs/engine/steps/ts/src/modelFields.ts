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

/** A field of a model: its path relative to the input ("device.id", "readings[].value") and its kind. */
export type ModelField = { path: string; kind: FieldKind }

type Node = { kind: FieldKind; fields?: [string, Node][]; items?: Node }

// Same bound as the controller's variables, so deeply nested models list the same paths.
const MAX_DEPTH = 8

const withIds = (attributes: Record<string, ModelAttribute>): ModelAttribute[] =>
  Object.entries(attributes).map(([id, a]) => ({ ...a, id: a.id || id }))

function objectOf(all: ModelAttribute[], parentId: string): Node {
  const fields = all
    .filter((a) => (a.parentId ?? '') === parentId)
    .map((a): [string, Node] | undefined => {
      const node = typeOf(all, a)
      return node ? [a.key, node] : undefined
    })
    .filter((f): f is [string, Node] => !!f)
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
  const out: ModelField[] = []
  const walk = (prefix: string, node: Node, depth: number) => {
    if (depth >= MAX_DEPTH) return
    if (node.kind === 'object') {
      for (const [name, child] of node.fields ?? []) {
        const path = prefix ? `${prefix}.${name}` : name
        out.push({ path, kind: child.kind })
        walk(path, child, depth + 1)
      }
    } else if (node.kind === 'array' && node.items) {
      const path = `${prefix}[]`
      out.push({ path, kind: node.items.kind })
      walk(path, node.items, depth + 1)
    }
  }
  walk('', objectOf(withIds(attributes ?? {}), ''), 0)
  return options.scalars ? out.filter((f) => SCALARS.includes(f.kind) && !f.path.includes('[]')) : out
}

/** Option label for a field, e.g. "device.id (string)". */
export const modelFieldLabel = (field: ModelField) => `${field.path} (${field.kind})`
