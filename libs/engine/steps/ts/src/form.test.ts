import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  createItem,
  Definition,
  describeForm,
  describeItem,
  fieldIssues,
  isFieldVisible,
  isVisible,
  optionsEvent,
  selectedOptions,
  valueAtPointer,
  visibleOptions,
  withField,
} from '../index'

const load = () => Definition.parse(readFileSync(join(__dirname, '../../plugins/hello-world/v1/step.json')))

describe('StepConfig model', () => {
  it('orders sections and fields from x-ui only', async () => {
    const sections = describeForm(await load())
    expect(sections.map((s) => s.group?.id)).toEqual(['message', 'dependencies', 'schedule'])
    expect(sections[0].fields.map((f) => `${f.path}:${f.schema['x-ui'].control}`)).toEqual([
      '/greeting:text',
      '/signature:textarea',
      '/language:select',
      '/uppercase:toggle',
      '/repeatCount:number',
    ])
  })

  it('merges static and named options with static precedence', async () => {
    const model = describeForm(await load())[1].fields.find((f) => f.name === 'modelId')!
    const state = {
      items: [
        { value: 'builtin:default', label: 'Remote label' },
        { value: 'mdl_1', label: 'Model 1' },
      ],
      selectedItems: [],
      query: '',
      loading: true,
      hasMore: false,
    }
    expect(visibleOptions(model, state)).toEqual([
      { value: 'builtin:default', label: 'Default model' },
      { value: 'mdl_1', label: 'Model 1' },
    ])
    // Static choices stay available while loading or after an error.
    expect(visibleOptions(model, { ...state, items: [], error: 'boom' })).toHaveLength(1)
  })

  it('derives event params declaratively and keeps unknown selections', async () => {
    const fields = describeForm(await load())[1].fields
    const model = fields.find((f) => f.name === 'modelId')!
    expect(optionsEvent(model, { secretId: 'sec_1' }, 'gpt')).toEqual({
      path: '/modelId',
      name: 'models',
      query: 'gpt',
      params: { capability: 'text', secretId: 'sec_1' },
    })
    const connections = fields.find((f) => f.name === 'connectionIds')!
    expect(
      selectedOptions(connections, ['t1', 'gone'], {
        items: [],
        selectedItems: [{ value: 't1', label: 'Connection 1' }],
        query: '',
        loading: false,
        hasMore: false,
      }),
    ).toEqual([
      { value: 't1', label: 'Connection 1' },
      { value: 'gone', label: 'gone (unavailable)', unavailable: true },
    ])
  })

  it('evaluates declarative visibility', () => {
    expect(isVisible({ field: '/scheduled', equals: true }, { scheduled: true })).toBe(true)
    expect(isVisible({ field: '/scheduled', equals: true }, {})).toBe(false)
    expect(isVisible({ field: '/mode', in: ['a', 'b'] }, { mode: 'b' })).toBe(true)
  })

  it('combines group and field visibility', async () => {
    const schedule = describeForm(await load())[2]
    const startAt = schedule.fields.find((f) => f.name === 'startAt')!
    expect(isFieldVisible(schedule, startAt, { scheduled: false, startAt: '2026-01-01T09:00:00Z' })).toBe(false)
    expect(isFieldVisible(schedule, startAt, { scheduled: true })).toBe(true)
    const hiddenGroup = { ...schedule, group: { ...schedule.group!, visibleWhen: { field: '/uppercase', equals: true } } }
    expect(isFieldVisible(hiddenGroup, startAt, { scheduled: true })).toBe(false)
  })

  it('attributes issues to fields and their items only', async () => {
    const connections = describeForm(await load())[1].fields.find((f) => f.name === 'connectionIds')!
    const issues = [
      { path: '/connectionIds', message: 'too many' },
      { path: '/connectionIds/2', message: 'too short' },
      { path: '/connectionIdsExtra', message: 'is not allowed' },
      { path: '', message: 'root' },
    ]
    expect(fieldIssues(connections, issues).map((i) => i.path)).toEqual(['/connectionIds', '/connectionIds/2'])
  })

  it('changes one field without touching other keys', () => {
    const saved = { greeting: 'hi', unknown: 1, startAt: 'hidden value' }
    expect(withField(saved, 'greeting', 'hey')).toEqual({ greeting: 'hey', unknown: 1, startAt: 'hidden value' })
    expect(withField(saved, 'greeting', undefined)).toEqual({ unknown: 1, startAt: 'hidden value' })
    expect(saved).toEqual({ greeting: 'hi', unknown: 1, startAt: 'hidden value' })
  })
})

describe('objectList rows', () => {
  const loadRows = () =>
    Definition.fromDocument(
      JSON.parse(readFileSync(join(__dirname, '../../contracts/v1/fixtures/valid/object-list.json'), 'utf8')).definition,
      'object-list',
    )
  const rowsField = (def: Definition) => describeForm(def).flatMap((s) => s.fields).find((f) => f.name === 'rows')!

  it('describes the fields of a row with paths into that row', () => {
    const fields = describeItem(rowsField(loadRows()), 1)
    expect(fields.map((f) => `${f.path}:${f.required}`)).toEqual([
      '/rows/1/left:true',
      '/rows/1/operator:true',
      '/rows/1/value:false',
      '/rows/1/strict:false',
    ])
    expect(describeItem(describeForm(loadRows())[0].fields[0], 0)).toEqual([])
  })

  it('creates rows from item defaults only', () => {
    expect(createItem(rowsField(loadRows()).schema)).toEqual({ operator: 'equal', strict: false })
  })

  it('derives row option parameters from the top-level configuration', () => {
    const config = { modelId: 'm1', rows: [{ operator: 'equal' }] }
    const [left] = describeItem(rowsField(loadRows()), 0)
    expect(optionsEvent(left, config, 'temp')).toEqual({
      path: '/rows/0/left',
      name: 'model-fields',
      query: 'temp',
      params: { model: 'm1', scalars: true },
    })
  })

  it('evaluates row conditions against the row and assigns issues per row', () => {
    const def = loadRows()
    const value = describeItem(rowsField(def), 0).find((f) => f.name === 'value')!
    expect(isVisible(value.schema['x-ui'].visibleWhen, { operator: 'lessThan' })).toBe(true)
    expect(isVisible(value.schema['x-ui'].visibleWhen, { operator: 'equal' })).toBe(false)

    const issues = def.validateConfig({ rows: [{ left: 'a', operator: 'equal' }, { operator: 'nope' }] })
    const second = describeItem(rowsField(def), 1)
    expect(fieldIssues(second[0], issues).map((i) => i.path)).toEqual(['/rows/1/left'])
    expect(fieldIssues(second[1], issues).map((i) => i.path)).toEqual(['/rows/1/operator'])
    expect(fieldIssues(describeItem(rowsField(def), 0)[0], issues)).toEqual([])
  })

  it('reads values at JSON Pointers', () => {
    const config = { rows: [{ left: 'a' }], 'a/b': { '~': 1 } }
    expect(valueAtPointer(config, '/rows/0/left')).toBe('a')
    expect(valueAtPointer(config, '/a~1b/~0')).toBe(1)
    expect(valueAtPointer(config, '/rows/3/left')).toBeUndefined()
    expect(valueAtPointer(config, '/rows/0/left/x')).toBeUndefined()
  })
})
