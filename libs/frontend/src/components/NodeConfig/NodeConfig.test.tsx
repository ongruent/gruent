import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  Definition,
  type NamedOptions,
  type StepDefinition,
  type OptionsEvent,
} from '@gruent/libs/engine/steps/ts'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import NodeConfig, { NodeConfigForm, NodeDefinitionsProvider } from './index'

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true

// Radix primitives measure themselves; jsdom has no ResizeObserver.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const helloWorldDoc: StepDefinition = JSON.parse(
  readFileSync(
    join(__dirname, '../../../../engine/steps/plugins/hello-world/v1/step.json'),
    'utf8',
  ),
)
const helloWorld = Definition.fromDocument(helloWorldDoc, 'sha256:hello-world-1')

/** Exercises fields the hello-world plugin does not: lists, conditional groups, and two fields on one source. */
const testDoc: StepDefinition = {
  contractVersion: 1,
  pluginType: 'test-node',
  pluginVersion: 1,
  displayName: 'Test node',
  description: 'Renderer test node',
  category: 'action',
  configSchema: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    additionalProperties: false,
    required: ['name'],
    'x-ui': {
      groups: [
        { id: 'advanced', title: 'Advanced', visibleWhen: { field: '/mode', equals: 'expert' } },
      ],
    },
    properties: {
      name: { type: 'string', title: 'Name', minLength: 1, 'x-ui': { control: 'text', order: 1 } },
      mode: {
        type: 'string',
        title: 'Mode',
        enum: ['basic', 'expert'],
        'x-ui': {
          control: 'select',
          order: 2,
          options: {
            static: [
              { value: 'basic', label: 'Basic' },
              { value: 'expert', label: 'Expert' },
            ],
          },
        },
      },
      primaryConnectionId: {
        type: 'string',
        title: 'Primary connection',
        'x-ui': { control: 'select', order: 3, options: { named: { name: 'connections' } } },
      },
      connectionIds: {
        type: 'array',
        title: 'Other connections',
        items: { type: 'string', minLength: 1 },
        'x-ui': { control: 'multiselect', order: 4, options: { named: { name: 'connections' } } },
      },
      tags: {
        type: 'array',
        title: 'Tags',
        items: { type: 'string', minLength: 1 },
        maxItems: 2,
        'x-ui': { control: 'list', order: 5 },
      },
      threshold: {
        type: 'number',
        title: 'Threshold',
        maximum: 10,
        'x-ui': { control: 'number', order: 6, group: 'advanced' },
      },
    },
  },
}
const testNode = Definition.fromDocument(testDoc, 'sha256:test-node-1')

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

type Harness = {
  onChange: jest.Mock
  onOptionsSearch: jest.Mock<void, [OptionsEvent]>
  onOptionsLoadMore: jest.Mock<void, [OptionsEvent]>
  render: (value: Record<string, unknown>, namedOptions?: NamedOptions) => void
}

const harness = (definition: Definition): Harness => {
  const h: Harness = {
    onChange: jest.fn(),
    onOptionsSearch: jest.fn(),
    onOptionsLoadMore: jest.fn(),
    render: (value, namedOptions = {}) =>
      act(() =>
        root.render(
          <NodeConfigForm
            definition={definition}
            value={value}
            namedOptions={namedOptions}
            onChange={h.onChange}
            onOptionsSearch={h.onOptionsSearch}
            onOptionsLoadMore={h.onOptionsLoadMore}
          />,
        ),
      ),
  }
  return h
}

const field = (path: string) => {
  const el = container.querySelector<HTMLElement>(`[data-path="${path}"]`)
  if (!el) throw new Error(`field ${path} is not rendered`)
  return el
}
const has = (path: string) => container.querySelector(`[data-path="${path}"]`) !== null
const input = (path: string) => field(path).querySelector<HTMLInputElement>('input, textarea')!
const errorsOf = (path: string) =>
  field(path).querySelector('[data-slot="field-error"]')?.textContent ?? ''

const type = (el: HTMLInputElement | HTMLTextAreaElement, text: string) =>
  act(() => {
    const proto =
      el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, text)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })

const click = (el: Element) => act(() => (el as HTMLElement).click())

const button = (scope: Element, label: string) => {
  const el = Array.from(scope.querySelectorAll('button')).find(
    (b) => b.getAttribute('aria-label') === label || b.textContent?.trim() === label,
  )
  if (!el) throw new Error(`button "${label}" not found`)
  return el
}

const open = (path: string) =>
  click(
    button(
      field(path),
      `Open ${field(path).querySelector('label')!.firstChild!.textContent} options`,
    ),
  )
const options = (path: string) =>
  Array.from(field(path).querySelectorAll('[role="option"]')).map((o) => o.textContent)

const state = (overrides: Partial<NamedOptions[string]> = {}): NamedOptions[string] => ({
  items: [],
  selectedItems: [],
  query: '',
  loading: false,
  hasMore: false,
  ...overrides,
})

describe('<NodeConfigForm />', () => {
  it('renders fields from the schema and x-ui in order, with labels, help text and required markers', () => {
    const h = harness(helloWorld)
    h.render({ greeting: 'Hi', language: 'en', repeatCount: 1 })

    const paths = Array.from(container.querySelectorAll('[data-path]')).map((e) =>
      e.getAttribute('data-path'),
    )
    expect(paths).toEqual([
      '/greeting',
      '/signature',
      '/language',
      '/uppercase',
      '/repeatCount',
      '/confidenceThreshold',
      '/secretId',
      '/modelId',
      '/connectionIds',
      '/scheduled',
    ])
    expect(Array.from(container.querySelectorAll('legend')).map((l) => l.textContent)).toEqual([
      'Message',
      'Dependencies',
      'Schedule',
    ])
    expect(field('/greeting').querySelector('label')!.textContent).toBe('Greeting*')
    expect(field('/signature').querySelector('label')!.textContent).toBe('Signature')
    expect(field('/greeting').textContent).toContain('Short greeting prepended to every message.')
    expect(input('/signature').tagName).toBe('TEXTAREA')
    expect(input('/greeting').getAttribute('placeholder')).toBe('Hello, world!')
  })

  it('never rewrites saved values or applies defaults on mount', () => {
    const h = harness(helloWorld)
    h.render({})
    expect(h.onChange).not.toHaveBeenCalled()
    expect(input('/greeting').value).toBe('')
    expect(input('/repeatCount').value).toBe('')
    // Missing required values are reported instead of being filled with defaults.
    expect(errorsOf('/greeting')).toBe('is required')
    expect(errorsOf('/repeatCount')).toBe('is required')
  })

  it('round-trips edits without touching other keys', () => {
    const h = harness(helloWorld)
    const saved = {
      greeting: 'Hi',
      language: 'en',
      repeatCount: 2,
      startAt: '2026-01-01T09:00:00Z',
      legacy: true,
    }
    h.render(saved)

    type(input('/greeting'), 'Hello')
    expect(h.onChange).toHaveBeenLastCalledWith({ ...saved, greeting: 'Hello' })

    type(input('/repeatCount'), '3')
    expect(h.onChange).toHaveBeenLastCalledWith({ ...saved, repeatCount: 3 })

    click(field('/uppercase').querySelector('[role="checkbox"]')!)
    expect(h.onChange).toHaveBeenLastCalledWith({ ...saved, uppercase: true })

    // Clearing a field removes its key; null is never written.
    type(input('/greeting'), '')
    expect(h.onChange).toHaveBeenLastCalledWith({
      language: 'en',
      repeatCount: 2,
      startAt: '2026-01-01T09:00:00Z',
      legacy: true,
    })
  })

  it('shows schema validation next to fields and keeps invalid saved values visible', () => {
    const h = harness(helloWorld)
    h.render({ greeting: 'Hi', language: 'de', repeatCount: 99, confidenceThreshold: 'high' })
    expect(errorsOf('/repeatCount')).toBe('must be <= 10')
    expect(input('/repeatCount').value).toBe('99')
    expect(errorsOf('/language')).toContain('must be equal to one of the allowed values')
    // The unknown static value stays selected and is marked unavailable.
    expect(field('/language').textContent).toContain('de (unavailable)')
    expect(errorsOf('/confidenceThreshold')).toBe('must be number')
    expect(field('/confidenceThreshold').textContent).toContain('Saved value: "high"')
    expect(h.onChange).not.toHaveBeenCalled()
  })

  it('hides conditional fields without discarding or skipping validation of their values', () => {
    const h = harness(helloWorld)
    const saved = {
      greeting: 'Hi',
      language: 'en',
      repeatCount: 1,
      scheduled: false,
      startAt: 'tomorrow',
    }
    h.render(saved)
    expect(has('/startAt')).toBe(false)
    expect(container.querySelector('[data-testid="node-config-issues"]')!.textContent).toContain(
      'Start at (hidden): must match format "date-time"',
    )

    click(field('/scheduled').querySelector('[role="checkbox"]')!)
    expect(h.onChange).toHaveBeenLastCalledWith({ ...saved, scheduled: true })

    h.render({ ...saved, scheduled: true })
    // The invalid saved value is shown verbatim so it can be corrected.
    expect(input('/startAt').value).toBe('tomorrow')
    expect(errorsOf('/startAt')).toBe('must match format "date-time"')
  })

  it('hides conditional groups and reports unknown keys', () => {
    const h = harness(testNode)
    h.render({ name: 'n', threshold: 50, extra: 1 })
    expect(has('/threshold')).toBe(false)
    const summary = container.querySelector('[data-testid="node-config-issues"]')!.textContent
    expect(summary).toContain('Threshold (hidden): must be <= 10')
    expect(summary).toContain('/extra: is not allowed')

    h.render({ name: 'n', mode: 'expert', threshold: 50, extra: 1 })
    expect(input('/threshold').value).toBe('50')
    expect(errorsOf('/threshold')).toBe('must be <= 10')
  })

  it('converts date-time values to RFC 3339 timestamps', () => {
    const h = harness(helloWorld)
    const saved = { greeting: 'Hi', language: 'en', repeatCount: 1, scheduled: true }
    h.render(saved)
    type(input('/startAt'), '2026-03-04T05:06:07')
    const startAt = h.onChange.mock.lastCall[0].startAt
    expect(new Date(startAt).getTime()).toBe(new Date('2026-03-04T05:06:07').getTime())
    expect(helloWorld.validateConfig({ ...saved, startAt })).toEqual([])
  })

  it('edits repeated values with item-level validation', () => {
    const h = harness(testNode)
    h.render({ name: 'n', tags: ['a', ''] })
    expect(errorsOf('/tags')).toContain('1: must NOT have fewer than 1 characters')
    expect(field('/tags').querySelectorAll('input')[1].getAttribute('aria-invalid')).toBe('true')

    type(field('/tags').querySelectorAll('input')[1], 'b')
    expect(h.onChange).toHaveBeenLastCalledWith({ name: 'n', tags: ['a', 'b'] })

    expect(button(field('/tags'), 'Add item').disabled).toBe(true) // maxItems: 2

    click(button(field('/tags'), 'Remove Tags item 1'))
    expect(h.onChange).toHaveBeenLastCalledWith({ name: 'n', tags: [''] })

    h.render({ name: 'n', tags: ['a'] })
    click(button(field('/tags'), 'Add item'))
    expect(h.onChange).toHaveBeenLastCalledWith({ name: 'n', tags: ['a', ''] })
  })
})

describe('select options', () => {
  it('renders static-only selects without parent data or events', () => {
    const h = harness(helloWorld)
    h.render({ greeting: 'Hi', language: 'en', repeatCount: 1 })
    expect(field('/language').textContent).toContain('English')
    expect(h.onOptionsSearch.mock.calls.map(([e]) => e.path)).not.toContain('/language')

    open('/language')
    expect(options('/language')).toEqual(['English', 'Spanish', 'French'])
    type(field('/language').querySelector('input')!, 'fr')
    expect(options('/language')).toEqual(['French'])
    expect(h.onOptionsSearch.mock.calls.map(([e]) => e.path)).not.toContain('/language')

    click(field('/language').querySelector('[role="option"]')!)
    expect(h.onChange).toHaveBeenLastCalledWith({ greeting: 'Hi', language: 'fr', repeatCount: 1 })
  })

  it('requests named-only options from the parent and renders its state', () => {
    const h = harness(helloWorld)
    const value = { greeting: 'Hi', language: 'en', repeatCount: 1 }
    h.render(value)
    expect(h.onOptionsSearch).toHaveBeenCalledWith({
      path: '/secretId',
      name: 'secrets',
      query: '',
      params: {},
    })

    h.render(value, { '/secretId': state({ loading: true }) })
    open('/secretId')
    expect(field('/secretId').querySelector('[role="status"]')!.textContent).toBe('Loading…')

    h.render(value, {
      '/secretId': state({ items: [{ value: 'sec_1', label: 'Prod key' }], hasMore: true }),
    })
    expect(options('/secretId')).toEqual(['Prod key'])

    click(button(field('/secretId'), 'Load more'))
    expect(h.onOptionsLoadMore).toHaveBeenCalledWith({
      path: '/secretId',
      name: 'secrets',
      query: '',
      params: {},
    })

    type(field('/secretId').querySelector('input')!, 'prod')
    expect(h.onOptionsSearch).toHaveBeenLastCalledWith({
      path: '/secretId',
      name: 'secrets',
      query: 'prod',
      params: {},
    })

    click(field('/secretId').querySelector('[role="option"]')!)
    expect(h.onChange).toHaveBeenLastCalledWith({ ...value, secretId: 'sec_1' })
  })

  it('lists static entries first in mixed selects and keeps them during loading and failure', () => {
    const h = harness(helloWorld)
    const value = { greeting: 'Hi', language: 'en', repeatCount: 1, secretId: 'sec_1' }
    h.render(value, {
      '/modelId': state({
        items: [
          { value: 'builtin:default', label: 'Duplicate' },
          { value: 'mdl_1', label: 'Model 1' },
        ],
      }),
    })
    expect(h.onOptionsSearch).toHaveBeenCalledWith({
      path: '/modelId',
      name: 'models',
      query: '',
      params: { capability: 'text', secretId: 'sec_1' },
    })
    open('/modelId')
    expect(options('/modelId')).toEqual(['Default model', 'Model 1'])

    h.render(value, { '/modelId': state({ loading: true }) })
    expect(options('/modelId')).toEqual(['Default model'])

    h.render(value, { '/modelId': state({ error: 'Could not load models' }) })
    expect(options('/modelId')).toEqual(['Default model'])
    expect(field('/modelId').querySelector('[role="alert"]')!.textContent).toBe(
      'Could not load models',
    )
  })

  it('refreshes dependent options through the parent without erasing the saved selection', () => {
    const h = harness(helloWorld)
    const value = {
      greeting: 'Hi',
      language: 'en',
      repeatCount: 1,
      secretId: 'sec_1',
      modelId: 'mdl_1',
    }
    h.render(value)
    h.onOptionsSearch.mockClear()

    h.render({ ...value, secretId: 'sec_2' })
    expect(h.onOptionsSearch.mock.calls).toEqual([
      [
        {
          path: '/modelId',
          name: 'models',
          query: '',
          params: { capability: 'text', secretId: 'sec_2' },
        },
      ],
    ])
    expect(h.onChange).not.toHaveBeenCalled()
    expect(field('/modelId').textContent).toContain('mdl_1')

    // Unrelated edits do not refresh options.
    h.onOptionsSearch.mockClear()
    h.render({ ...value, secretId: 'sec_2', greeting: 'Hey' })
    expect(h.onOptionsSearch).not.toHaveBeenCalled()
  })

  it('keeps saved selections visible regardless of the loaded page, search or availability', () => {
    const h = harness(helloWorld)
    const value = {
      greeting: 'Hi',
      language: 'en',
      repeatCount: 1,
      modelId: 'mdl_9',
      connectionIds: ['t1', 'gone'],
    }
    h.render(value, {
      '/modelId': state({
        query: 'other',
        items: [{ value: 'mdl_1', label: 'Model 1' }],
        selectedItems: [{ value: 'mdl_9', label: 'Model 9' }],
      }),
      '/connectionIds': state({ error: 'offline', selectedItems: [{ value: 't1', label: 'Connection 1' }] }),
    })
    expect(field('/modelId').textContent).toContain('Model 9')
    const chips = Array.from(field('/connectionIds').querySelectorAll('[data-value]')).map(
      (c) => c.textContent,
    )
    expect(chips).toEqual(['Connection 1', 'gone (unavailable)'])
    expect(h.onChange).not.toHaveBeenCalled()

    // Unavailable selections can be removed deliberately, never automatically.
    click(button(field('/connectionIds'), 'Remove gone (unavailable)'))
    expect(h.onChange).toHaveBeenLastCalledWith({ ...value, connectionIds: ['t1'] })
  })

  it('stores identifiers in multiselects', () => {
    const h = harness(helloWorld)
    const value = { greeting: 'Hi', language: 'en', repeatCount: 1, connectionIds: ['t1'] }
    h.render(value, {
      '/connectionIds': state({
        items: [
          { value: 't1', label: 'Connection 1' },
          { value: 't2', label: 'Connection 2' },
        ],
      }),
    })
    open('/connectionIds')
    const second = field('/connectionIds').querySelectorAll('[role="option"]')[1]
    click(second)
    expect(h.onChange).toHaveBeenLastCalledWith({ ...value, connectionIds: ['t1', 't2'] })
    click(field('/connectionIds').querySelector('[role="option"]')!)
    expect(h.onChange).toHaveBeenLastCalledWith({ ...value, connectionIds: undefined })
    expect('connectionIds' in h.onChange.mock.lastCall[0]).toBe(false)
  })

  it('keeps search and pagination independent between fields that use the same named source', () => {
    const h = harness(testNode)
    const value = { name: 'n' }
    h.render(value, {
      '/primaryConnectionId': state({ query: 'pump', items: [{ value: 't1', label: 'Pump' }] }),
      '/connectionIds': state({ items: [{ value: 't2', label: 'Valve' }], hasMore: true }),
    })
    expect(h.onOptionsSearch.mock.calls.map(([e]) => [e.path, e.name])).toEqual([
      ['/primaryConnectionId', 'connections'],
      ['/connectionIds', 'connections'],
    ])
    open('/primaryConnectionId')
    open('/connectionIds')
    expect(options('/primaryConnectionId')).toEqual(['Pump'])
    expect(options('/connectionIds')).toEqual(['Valve'])

    h.onOptionsSearch.mockClear()
    type(field('/connectionIds').querySelector('input')!, 'val')
    expect(h.onOptionsSearch.mock.calls).toEqual([
      [{ path: '/connectionIds', name: 'connections', query: 'val', params: {} }],
    ])
    click(button(field('/connectionIds'), 'Load more'))
    expect(h.onOptionsLoadMore.mock.calls).toEqual([
      [{ path: '/connectionIds', name: 'connections', query: 'val', params: {} }],
    ])
  })
})

describe('<NodeConfig />', () => {
  const v2 = Definition.fromDocument(
    { ...helloWorldDoc, pluginVersion: 2, displayName: 'v2', configSchema: testDoc.configSchema },
    'sha256:hello-world-2',
  )
  const source = {
    resolve: jest.fn(async (pluginType: string, pluginVersion: number) => {
      const found = [helloWorld, v2].find(
        (d) => d.pluginType === pluginType && d.pluginVersion === pluginVersion,
      )
      if (!found) throw new Error(`${pluginType}@${pluginVersion}: plugin version not available`)
      return found
    }),
  }

  const renderNode = async (pluginType: string, pluginVersion: number) => {
    await act(async () =>
      root.render(
        <NodeDefinitionsProvider source={source}>
          <NodeConfig
            pluginType={pluginType}
            pluginVersion={pluginVersion}
            value={{}}
            namedOptions={{}}
            onChange={jest.fn()}
            onOptionsSearch={jest.fn()}
            onOptionsLoadMore={jest.fn()}
          />
        </NodeDefinitionsProvider>,
      ),
    )
  }

  it('resolves the exact plugin version when several versions coexist', async () => {
    await renderNode('hello-world', 1)
    expect(has('/greeting')).toBe(true)
    await renderNode('hello-world', 2)
    expect(has('/greeting')).toBe(false)
    expect(has('/name')).toBe(true)
    expect(source.resolve).toHaveBeenLastCalledWith('hello-world', 2)
  })

  it('fails visibly for unknown versions instead of falling back', async () => {
    await renderNode('hello-world', 3)
    const alert = container.querySelector('[data-testid="node-config-unsupported"]')!
    expect(alert.textContent).toContain('Unsupported node definition: hello-world v3')
    expect(alert.textContent).toContain('hello-world@3: plugin version not available')
    expect(container.querySelector('[data-testid="node-config"]')).toBeNull()
  })

  it('fails visibly without a definition source', async () => {
    await act(async () =>
      root.render(
        <NodeConfig
          pluginType="hello-world"
          pluginVersion={1}
          value={{}}
          namedOptions={{}}
          onChange={jest.fn()}
          onOptionsSearch={jest.fn()}
          onOptionsLoadMore={jest.fn()}
        />,
      ),
    )
    expect(container.textContent).toContain('No node definition source is configured.')
  })
})
