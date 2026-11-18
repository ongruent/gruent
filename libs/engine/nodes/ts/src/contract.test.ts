import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { Definition, DefinitionError, DefinitionRegistry, isDateTime } from '../index'

const root = join(__dirname, '..', '..')
const read = (...p: string[]) => readFileSync(join(root, ...p))
const json = (...p: string[]) => JSON.parse(read(...p).toString('utf8'))
const files = (...p: string[]) => readdirSync(join(root, ...p)).filter((f) => f.endsWith('.json')).sort()
const paths = (issues: { path: string }[]) => [...new Set(issues.map((i) => i.path))].sort()

type Manifest = {
  plugins: { pluginType: string; pluginVersion: number; definition: { path: string; digest: string } }[]
}
const manifest: Manifest = json('generated', 'manifest.json')

describe('shared plugin configuration fixtures', () => {
  for (const entry of manifest.plugins) {
    const dir = entry.definition.path.replace(/\/node\.json$/, '')
    for (const kind of ['valid', 'invalid']) {
      for (const file of files(dir, 'fixtures', kind)) {
        it(`${dir}/fixtures/${kind}/${file}`, async () => {
          const def = await Definition.parse(read(entry.definition.path))
          const fixture = json(dir, 'fixtures', kind, file)
          expect(paths(def.validateConfig(fixture.config))).toEqual([...(fixture.errors ?? [])].sort())
        })
      }
    }
  }
})

describe('shared definition fixtures', () => {
  for (const file of files('contracts/v1/fixtures/valid')) {
    it(`valid/${file}`, () => {
      expect(() => Definition.fromDocument(json('contracts/v1/fixtures/valid', file).definition, file)).not.toThrow()
    })
  }
  for (const file of files('contracts/v1/fixtures/invalid')) {
    it(`invalid/${file}`, () => {
      const fixture = json('contracts/v1/fixtures/invalid', file)
      let error: unknown
      try {
        Definition.fromDocument(fixture.definition, file)
      } catch (e) {
        error = e
      }
      expect(error).toBeInstanceOf(DefinitionError)
      const reported = paths((error as DefinitionError).issues)
      for (const p of fixture.errors) expect(reported).toContain(p)
    })
  }
})

describe('registry', () => {
  it('resolves exact identities with the manifest digest and no fallback', async () => {
    const registry = new DefinitionRegistry()
    for (const entry of manifest.plugins) {
      const def = await registry.register(read(entry.definition.path))
      expect(def.digest).toBe(entry.definition.digest)
    }
    expect(registry.resolve('hello-world', 1).document.displayName).toBe('Hello world')
    expect(() => registry.resolve('hello-world', 2)).toThrow('hello-world@2: plugin version not available')
  })

  it('consumes a custom package definition without generated types', async () => {
    const registry = new DefinitionRegistry()
    const def = await registry.register(read('testdata/packages/echo/node.json'))
    expect(def.key).toBe('custom-echo@3')
    expect(def.validateConfig({ prefix: 5 })).toEqual([{ path: '/prefix', message: 'must be string' }])
  })

  it('rejects a changed definition for a published identity', async () => {
    const registry = new DefinitionRegistry()
    const original = read('plugins/hello-world/v1/node.json').toString('utf8')
    await registry.register(original)
    await expect(registry.register(original.replace('"Hello world"', '"Hello"'))).rejects.toThrow('different definition')
  })
})

it('creates configuration from defaults only', async () => {
  const def = await Definition.parse(read('plugins/hello-world/v1/node.json'))
  expect(def.createConfig()).toEqual({
    greeting: 'Hello, world!',
    language: 'en',
    repeatCount: 1,
    scheduled: false,
    uppercase: false,
  })
})

it.each([
  ['2026-11-18T09:30:00Z', true],
  ['2024-02-29T23:59:59.999-08:00', true],
  ['2026-11-18t09:30:00Z', false],
  ['2026-11-18T09:30:00z', false],
  ['2026-11-18T09:30Z', false],
  ['2023-02-29T00:00:00Z', false],
  ['2026-11-18T24:00:00Z', false],
  ['2026-12-31T23:59:60Z', false],
  ['2026-11-18T09:30:00+24:00', false],
])('isDateTime(%s) = %s', (s, ok) => {
  expect(isDateTime(s)).toBe(ok)
})
