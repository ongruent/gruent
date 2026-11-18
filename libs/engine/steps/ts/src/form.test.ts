import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { Definition, describeForm, isVisible, optionsEvent, selectedOptions, visibleOptions } from '../index'

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
})
