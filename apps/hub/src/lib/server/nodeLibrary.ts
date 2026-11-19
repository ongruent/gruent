import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import type { Manifest, ManifestEntry } from '@gruent/libs/engine/steps/ts'

const MANIFEST = join('generated', 'manifest.json')

/**
 * Root of the node library (libs/engine/steps). Definitions are read from disk on every request, so publishing
 * a definition only requires updating the library directory, never rebuilding the hub.
 */
const libraryRoot = () => {
  const candidates = [
    process.env.GRUENT_NODE_LIBRARY_DIR,
    join(process.cwd(), 'libs', 'engine', 'steps'),
    join(process.cwd(), '..', '..', 'libs', 'engine', 'steps'),
  ].filter((p): p is string => !!p)
  const root = candidates.find((p) => existsSync(join(p, MANIFEST)))
  if (!root) throw new Error(`node library not found (looked in ${candidates.join(', ')})`)
  return resolve(root)
}

/** The published definitions: exact identities, categories and digests. */
export const readManifest = async (): Promise<Manifest> => {
  const manifest = JSON.parse(await readFile(join(libraryRoot(), MANIFEST), 'utf8')) as Manifest
  return {
    manifestVersion: manifest.manifestVersion,
    plugins: manifest.plugins.map(
      ({ pluginType, pluginVersion, contractVersion, category, definition }): ManifestEntry => ({
        pluginType,
        pluginVersion,
        contractVersion,
        category,
        definition: { path: definition.path, digest: definition.digest },
      }),
    ),
  }
}

/** Original definition bytes for an exact identity listed in the manifest, or null if it is not published. */
export const readDefinition = async (
  pluginType: string,
  pluginVersion: number,
): Promise<Buffer | null> => {
  const root = libraryRoot()
  const { plugins } = await readManifest()
  const entry = plugins.find(
    (p) => p.pluginType === pluginType && p.pluginVersion === pluginVersion,
  )
  if (!entry) return null
  const file = resolve(root, entry.definition.path)
  if (!file.startsWith(root + sep))
    throw new Error(`${entry.definition.path} is outside the node library`)
  return readFile(file)
}
