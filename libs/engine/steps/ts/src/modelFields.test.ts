import { modelFieldLabel, modelFields } from '../index'

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
      { path: 'active', kind: 'boolean' },
      { path: 'deviceId', kind: 'string' },
      { path: 'location', kind: 'object' },
      { path: 'location.lat', kind: 'number' },
      { path: 'readings', kind: 'array' },
      { path: 'readings[]', kind: 'object' },
      { path: 'readings[].token', kind: 'string' },
      { path: 'tags', kind: 'array' },
      { path: 'tags[]', kind: 'string' },
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
      { path: 'n', kind: 'number' },
    ])
    expect(modelFields(null)).toEqual([])
  })

  it('labels fields with their kind', () => {
    expect(modelFieldLabel({ path: 'location.lat', kind: 'number' })).toBe('location.lat (number)')
  })
})
