import { modelFieldLabel, modelFields, typeFields } from '../index'

// The "Sensitive telemetry" model of the controller's compiler tests (services/controller/internal/compiler),
// so the paths below are the ones the controller accepts for it.
const telemetry = {
  c1: { id: 'c1', key: 'deviceId', type: 'string' },
  c2: { id: 'c2', key: 'location', type: 'object' },
  c3: { id: 'c3', key: 'lat', type: 'number', parentId: 'c2' },
  c4: {
    id: 'c4',
    key: 'readings',
    type: 'array',
    subtype: 'object',
    arrayObjectAttributes: { c5: { id: 'c5', key: 'token', type: 'string', parentId: 'c4' } },
  },
  c6: { key: 'tags', type: 'array', subtype: 'string' },
  c7: { id: 'c7', key: 'active', type: 'boolean' },
}

describe('modelFields', () => {
  it('lists every field in path order, including objects, arrays and array items', () => {
    expect(modelFields(telemetry)).toEqual([
      { path: 'active', kind: 'boolean', required: false },
      { path: 'deviceId', kind: 'string', required: false },
      { path: 'location', kind: 'object', required: false },
      { path: 'location.lat', kind: 'number', required: false },
      { path: 'readings', kind: 'array', required: false },
      { path: 'readings[]', kind: 'object', required: false },
      { path: 'readings[].token', kind: 'string', required: false },
      { path: 'tags', kind: 'array', required: false },
      { path: 'tags[]', kind: 'string', required: false },
    ])
  })

  it('lists only single values with scalars', () => {
    expect(modelFields(telemetry, { scalars: true }).map((f) => f.path)).toEqual([
      'active',
      'deviceId',
      'location.lat',
    ])
  })

  it('skips attributes the controller cannot type and tolerates missing attributes', () => {
    expect(modelFields({ a: { key: 'blob', type: 'binary' }, b: { key: 'n', type: 'number' } })).toEqual([
      { path: 'n', kind: 'number', required: false },
    ])
    expect(modelFields(null)).toEqual([])
  })

  it('labels fields with their kind', () => {
    expect(modelFieldLabel({ path: 'location.lat', kind: 'number', required: false })).toBe('location.lat (number)')
  })
})

describe('typeFields', () => {
  // A resolved input type as returned by the controller's compile results.
  const input = {
    kind: 'object',
    fields: [
      { name: 'deviceId', type: { kind: 'string' }, required: true },
      {
        name: 'location',
        type: { kind: 'object', fields: [{ name: 'lat', type: { kind: 'number' }, required: true }] },
      },
      {
        name: 'readings',
        type: { kind: 'array', items: { kind: 'object', fields: [{ name: 'celsius', type: { kind: 'number' } }] } },
        required: true,
      },
    ],
  }

  it('lists the fields of a resolved type with whether they are required', () => {
    expect(typeFields(input)).toEqual([
      { path: 'deviceId', kind: 'string', required: true },
      { path: 'location', kind: 'object', required: false },
      { path: 'location.lat', kind: 'number', required: false },
      { path: 'readings', kind: 'array', required: true },
      { path: 'readings[]', kind: 'object', required: true },
      { path: 'readings[].celsius', kind: 'number', required: false },
    ])
  })

  it('has no fields for opaque, signal and missing types', () => {
    expect(typeFields({ kind: 'bytes' })).toEqual([])
    expect(typeFields({ kind: 'signal' })).toEqual([])
    expect(typeFields(undefined)).toEqual([])
  })

  it('marks required model attributes', () => {
    expect(modelFields({ a: { key: 'message', type: 'string', required: true } })).toEqual([
      { path: 'message', kind: 'string', required: true },
    ])
  })
})
