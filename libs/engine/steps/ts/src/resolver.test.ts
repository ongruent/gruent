import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { DefinitionResolver, digest, Manifest, ManifestEntry, UnsupportedDefinitionError } from '../index'

const helloWorld = readFileSync(join(__dirname, '../../plugins/hello-world/v1/step.json'), 'utf8')

/** A second version of hello-world with a different display name, as if loaded from a custom library. */
const helloWorldV2 = (() => {
  const doc = JSON.parse(helloWorld)
  doc.pluginVersion = 2
  doc.displayName = 'Hello world (v2)'
  return JSON.stringify(doc)
})()

const entry = async (source: string, version: number): Promise<ManifestEntry> => ({
  pluginType: 'hello-world',
  pluginVersion: version,
  contractVersion: 1,
  category: 'processing',
  definition: {
    path: `plugins/hello-world/v${version}/step.json`,
    digest: await digest(new TextEncoder().encode(source)),
  },
})

const library = async (sources: Record<string, string>) => {
  const manifest: Manifest = {
    manifestVersion: 1,
    plugins: [await entry(sources['plugins/hello-world/v1/step.json'], 1)],
  }
  if (sources['plugins/hello-world/v2/step.json'])
    manifest.plugins.push(await entry(sources['plugins/hello-world/v2/step.json'], 2))
  const loads: string[] = []
  const resolver = new DefinitionResolver({
    manifest: async () => manifest,
    definition: async (e) => {
      loads.push(e.definition.path)
      return sources[e.definition.path]
    },
  })
  return { manifest, resolver, loads }
}

describe('DefinitionResolver', () => {
  it('resolves the exact version when several versions coexist', async () => {
    const { resolver } = await library({
      'plugins/hello-world/v1/step.json': helloWorld,
      'plugins/hello-world/v2/step.json': helloWorldV2,
    })
    expect((await resolver.resolve('hello-world', 1)).document.displayName).toBe('Hello world')
    expect((await resolver.resolve('hello-world', 2)).document.displayName).toBe('Hello world (v2)')
    expect((await resolver.all()).map((d) => d.key)).toEqual(['hello-world@1', 'hello-world@2'])
  })

  it('never falls back to another version', async () => {
    const { resolver } = await library({ 'plugins/hello-world/v1/step.json': helloWorld })
    await expect(resolver.resolve('hello-world', 2)).rejects.toThrow(UnsupportedDefinitionError)
    await expect(resolver.resolve('hello-world', 2)).rejects.toThrow('hello-world@2: plugin version not available')
    await expect(resolver.resolve('unknown', 1)).rejects.toThrow('unknown@1: plugin version not available')
    await expect(resolver.resolve('hello-world', 1.5)).rejects.toThrow('must be an integer')
  })

  it('caches definitions by identity', async () => {
    const { resolver, loads } = await library({ 'plugins/hello-world/v1/step.json': helloWorld })
    const [a, b] = await Promise.all([resolver.resolve('hello-world', 1), resolver.resolve('hello-world', 1)])
    expect(a).toBe(b)
    expect(loads).toEqual(['plugins/hello-world/v1/step.json'])
  })

  it('rejects definitions whose bytes do not match the manifest digest', async () => {
    const { resolver } = await library({ 'plugins/hello-world/v1/step.json': helloWorld })
    const tampered = new DefinitionResolver({
      manifest: () => resolver.manifest(),
      definition: async () => helloWorld.replace('Hello world', 'Tampered'),
    })
    await expect(tampered.resolve('hello-world', 1)).rejects.toThrow('does not match manifest')
  })

  it('rejects a definition that declares a different identity', async () => {
    const { manifest } = await library({ 'plugins/hello-world/v1/step.json': helloWorld })
    const wrong = new DefinitionResolver({
      manifest: async () => ({ ...manifest, plugins: [{ ...(await entry(helloWorldV2, 1)) }] }),
      definition: async () => helloWorldV2,
    })
    await expect(wrong.resolve('hello-world', 1)).rejects.toThrow('definition declares hello-world@2')
  })

  it('validates definitions against the contract on ingestion', async () => {
    const invalid = helloWorld.replace('"control": "text"', '"control": "rich-text"')
    const { resolver } = await library({ 'plugins/hello-world/v1/step.json': invalid })
    await expect(resolver.resolve('hello-world', 1)).rejects.toThrow('invalid step definition')
  })

  it('retries after a failed load', async () => {
    let fail = true
    const { manifest } = await library({ 'plugins/hello-world/v1/step.json': helloWorld })
    const resolver = new DefinitionResolver({
      manifest: async () => manifest,
      definition: async () => {
        if (fail) throw new Error('network down')
        return helloWorld
      },
    })
    await expect(resolver.resolve('hello-world', 1)).rejects.toThrow('network down')
    fail = false
    expect((await resolver.resolve('hello-world', 1)).key).toBe('hello-world@1')
  })
})
