import { DefinitionResolver, type Manifest } from '@gruent/libs/engine/nodes/ts'

const fetchOk = async (url: string) => {
  const res = await fetch(url, { cache: 'no-cache' })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.errors?.[0] ?? `${url}: ${res.status} ${res.statusText}`)
  }
  return res
}

/**
 * Resolves exact plugin identities to their original JSON definitions served by /api/node-definitions. Nothing
 * is bundled per plugin: definitions are loaded, digest-checked and validated at runtime.
 */
const nodeDefinitions = new DefinitionResolver({
  manifest: async () => (await (await fetchOk('/api/node-definitions')).json()) as Manifest,
  definition: async ({ pluginType, pluginVersion }) =>
    new Uint8Array(
      await (
        await fetchOk(`/api/node-definitions/${encodeURIComponent(pluginType)}/${pluginVersion}`)
      ).arrayBuffer(),
    ),
})

export default nodeDefinitions
