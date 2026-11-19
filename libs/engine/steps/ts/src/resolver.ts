/**
 * Runtime resolution of exact plugin identities to their original JSON definitions. Definitions are fetched
 * through a caller-supplied loader (for example an HTTP endpoint serving the node library), validated against
 * the contract on ingestion and checked against the manifest digest. Nothing is generated or bundled per
 * plugin, so new definitions are picked up without rebuilding the consumer.
 */
import { Category, Definition, identityKey } from './contract'

/** One published definition, as recorded in generated/manifest.json. */
export type ManifestEntry = {
  pluginType: string
  pluginVersion: number
  contractVersion: number
  category: Category
  definition: { path: string; digest: string }
}

export type Manifest = { manifestVersion: number; plugins: ManifestEntry[] }

/** Thrown when an exact identity cannot be resolved. There is never a fallback to another version. */
export class UnsupportedDefinitionError extends Error {
  constructor(
    readonly pluginType: string,
    readonly pluginVersion: number,
    reason: string,
  ) {
    super(`${identityKey(pluginType, pluginVersion)}: ${reason}`)
    this.name = 'UnsupportedDefinitionError'
  }
}

export type DefinitionLoader = {
  /** Lists the published definitions. */
  manifest: () => Promise<Manifest>
  /** Returns the original bytes of one definition from the manifest. */
  definition: (entry: ManifestEntry) => Promise<string | Uint8Array>
}

/**
 * Resolves (pluginType, pluginVersion) to a validated Definition. Results are cached per identity; failures are
 * not cached, so a temporarily unavailable definition can be retried.
 */
export class DefinitionResolver {
  private manifestPromise?: Promise<Manifest>
  private readonly definitions = new Map<string, Promise<Definition>>()

  constructor(private readonly loader: DefinitionLoader) {}

  manifest(): Promise<Manifest> {
    if (!this.manifestPromise) {
      this.manifestPromise = this.loader.manifest().catch((e) => {
        this.manifestPromise = undefined
        throw e
      })
    }
    return this.manifestPromise
  }

  /** Forgets the cached manifest, for example after new definitions were published. Definitions stay cached. */
  refresh(): void {
    this.manifestPromise = undefined
  }

  resolve(pluginType: string, pluginVersion: number): Promise<Definition> {
    const key = identityKey(pluginType, pluginVersion)
    let pending = this.definitions.get(key)
    if (!pending) {
      pending = this.load(pluginType, pluginVersion)
      pending.catch(() => this.definitions.delete(key))
      this.definitions.set(key, pending)
    }
    return pending
  }

  /** Every published definition, sorted by plugin type and version. */
  async all(): Promise<Definition[]> {
    const { plugins } = await this.manifest()
    const sorted = [...plugins].sort((a, b) =>
      a.pluginType === b.pluginType ? a.pluginVersion - b.pluginVersion : a.pluginType < b.pluginType ? -1 : 1,
    )
    return Promise.all(sorted.map((p) => this.resolve(p.pluginType, p.pluginVersion)))
  }

  private async load(pluginType: string, pluginVersion: number): Promise<Definition> {
    if (!Number.isInteger(pluginVersion))
      throw new UnsupportedDefinitionError(pluginType, pluginVersion, 'plugin version must be an integer')
    const { plugins } = await this.manifest()
    const entry = plugins.find((p) => p.pluginType === pluginType && p.pluginVersion === pluginVersion)
    if (!entry) throw new UnsupportedDefinitionError(pluginType, pluginVersion, 'plugin version not available')

    const def = await Definition.parse(await this.loader.definition(entry))
    if (def.digest !== entry.definition.digest)
      throw new UnsupportedDefinitionError(
        pluginType,
        pluginVersion,
        `definition digest ${def.digest} does not match manifest ${entry.definition.digest}`,
      )
    if (def.pluginType !== pluginType || def.pluginVersion !== pluginVersion)
      throw new UnsupportedDefinitionError(pluginType, pluginVersion, `definition declares ${def.key}`)
    return def
  }
}
