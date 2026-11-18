# Node library (`libs/engine/nodes`)

Versioned node plugin definitions, the shared contract they follow, and the compiler that turns them into
Kotlin configuration types. **`node.json` is the source of truth.** Kotlin is the only generated language. Go
and TypeScript read the original JSON, so a new plugin needs no per-plugin Go or TypeScript code and no
application rebuild.

```text
libs/engine/nodes/
  contracts/v1/node-definition.schema.json   machine-readable envelope schema (contract v1)
  contracts/v1/fixtures/{valid,invalid}/     shared definition fixtures (Go + TS)
  plugins/<pluginType>/v<N>/node.json        definitions (immutable once published)
  plugins/<pluginType>/v<N>/fixtures/        shared config fixtures (Go + TS + Kotlin)
  plugins/<pluginType>/v<N>/plugin.wasm      optional WASM artifact, recorded in the manifest
  compiler/                                  compile / create / new-version CLI (Go)
  generated/manifest.json                    GENERATED: identity -> definition + artifact + digests
  generated/kotlin/                          GENERATED: Kotlin configuration types
  *.go, plan/                                Go consumer: ingestion, validation, registry, plan hydration
  ts/                                        TypeScript consumer: ingestion, validation, form model
  kotlin/                                    Kotlin support library + tests for generated types
```

## Commands

| Command | What it does |
| --- | --- |
| `nx run nodes:create --name=my-node [--category=action]` | Scaffolds `plugins/my-node/v1` with a valid empty definition and fixtures. If the node exists, it asks whether to create the next version instead (`--yes`/`--no` answer without prompting). |
| `nx run nodes:new-version --name=my-node` | Copies the latest `v<N>` to `v<N+1>` and bumps `pluginVersion`. `plugin.wasm` is not copied because it is built per version. |
| `nx run nodes:compile` | Validates every definition and fixture, then rewrites `generated/`. The compiler also accepts individual `node.json` files (`go run ./compiler compile path/node.json --out DIR`). |
| `nx run nodes:check` | Fails if `generated/` is stale. Run it in CI. |
| `nx run nodes:test` | Go, TypeScript and Kotlin suites over the same fixtures. |

## Definition envelope

```json
{
  "contractVersion": 1,
  "pluginType": "hello-world",
  "pluginVersion": 1,
  "displayName": "Hello world",
  "description": "…",
  "category": "processing",
  "io": { "inputs": ["source", "processing"], "outputs": ["action"] },
  "configSchema": { "$schema": "https://json-schema.org/draft/2020-12/schema", "type": "object", "additionalProperties": false, "properties": { } }
}
```

See [`plugins/hello-world/v1/node.json`](plugins/hello-world/v1/node.json) for the canonical example, which
uses every control.

Decisions where the issue's proposal conflicted with itself:

- **`pluginType` vs category.** The proposal used `pluginType` twice. `pluginType` is the identity slug
  (`hello-world`), and `category` is the enum `source | processing | action | conditional | custom`. This
  matches the previous `node.json` `category` field and the legacy `ChannelNodeType`.
- **Versions are linear integers** (`pluginVersion: 1, 2, 3 …`, directories `v1`, `v2`, …), as required by
  `new-version`. Every version counts as a "major" version, so a breaking configuration change always gets a
  new version. Semantic version strings are rejected.
- **I/O allowlists use the category enum.** `io.inputs` lists the upstream categories a plugin accepts, and
  `io.outputs` lists the downstream categories it may feed. A channel edge is valid only if **both** ends
  allow it. Source plugins must have no inputs. Other plugins must accept at least one category. Typed
  ports and data types from the legacy contract are not part of v1.
- **Objects.** The only object is the configuration root. Object-valued fields are rejected, and
  dependencies such as models, secrets and things are referenced by ID through named selects. Grouping is
  layout only (`configSchema.x-ui.groups`), so it adds no configuration nesting.

## Supported schema subset (closed)

Anything outside this list is rejected when a definition is ingested or compiled. This includes `$ref`,
`$id`, `oneOf`, `multipleOf`, `null` types, other formats, and custom widgets. As a result, no schema
reference can be unresolved or fetched remotely.

| Field `type` | Keywords | Controls |
| --- | --- | --- |
| `string` | `minLength`, `maxLength`, `pattern`, `format: "date-time"`, `enum` (select only), `default` | `text`, `textarea`, `select`, `datetime` (requires `format: "date-time"`, and the format requires it) |
| `number` | `minimum`, `maximum`, `exclusiveMinimum`, `exclusiveMaximum`, `default` | `number` (`step`) |
| `integer` | `minimum` **and** `maximum` (required, within ±(2^53−1)), `default` | `number` (`step`) |
| `boolean` | `default` | `toggle` |
| `array` | `items` (primitive `string`/`number`/`integer` only), `minItems`, `maxItems`, `uniqueItems`, `default` | `multiselect` (string items, needs `options`), `list` |

Every field needs `title` and `x-ui` with `control` and a unique `order`. `description` is help text.
Optional `x-ui` keys are `group`, `placeholder`, `visibleWhen` and `options`. Field names are camelCase
ASCII and cannot be Kotlin hard keywords.

**Selects.** `x-ui.options` declares `static`, `named`, or both:

- Static-only selects need no parent data. An `enum` is optional, but if present it must equal the static
  values.
- Named-only and mixed selects must not declare `enum`, because it would reject valid dynamic values.
- `named` identifies a collection (`{ "name": "secrets", "params": {…}, "paramsFromFields": { "secretId": "/secretId" } }`),
  never an endpoint or code. Parameters are constants or JSON Pointers to other fields.
- Values are string identifiers. Static entries come first, and a value that appears in both sources is
  shown once with the static label.
- A `multiselect` is one field: its option state is keyed by the array pointer (`/thingIds`), and item
  errors are reported at `/thingIds/<index>`. Selectors inside array items are not supported in v1.

**Conditional sections.** `visibleWhen: { "field": "/ptr", "equals": v }` or `{ "field": "/ptr", "in": [...] }`
can be set on a field or a group. It cannot target arrays, the field itself, or a field inside the group it
hides. It affects presentation only: hidden fields keep their values and are still validated.

**Patterns** are unanchored searches. They must be portable across RE2 (Go), ECMAScript `u` (TypeScript) and
`java.util.regex` (Kotlin). Only plain `(?:` groups are allowed, and backreferences are not.

## Missing, null, empty and defaults

- An optional field that is missing is absent from the configuration (Kotlin `null`). A missing required
  field is reported at `/<field>`.
- `null` is never valid. To clear an optional field, remove its key.
- An empty string or empty array is a value. It is valid unless `minLength`/`minItems` forbid it, so
  required text fields should declare `minLength: 1`.
- Defaults are annotations. They are applied only when a configuration is created: Go
  `Definition.NewConfig()` and TS `Definition.createConfig()`, or a future migration. Validators, editors and
  Kotlin decoding never inject defaults. Every default must satisfy its field's schema.
- Unknown properties are rejected at `/<name>`, and that includes `x-ui`.
- Numbers are not coerced. `1.0` counts as an integer. String lengths count Unicode code points. `date-time`
  is strict RFC 3339 with an upper-case `T`, mandatory seconds and an offset, and leap seconds are rejected.
  The same rule is implemented in all three languages instead of relying on each library's format checker:
  Ajv's, for example, accepts a space separator.

## Validators and generators (proven by shared fixtures)

| Language | Ingestion / validation | Notes |
| --- | --- | --- |
| Go | `santhosh-tekuri/jsonschema/v6` with the embedded envelope schema and semantic rules (`semantic.go`) | Remote loading is disabled. Compiled validators are cached by definition digest. |
| TypeScript | Ajv 2020 (`ts/src/contract.ts`), with `x-ui` registered as an annotation keyword | No `loadSchema`, so nothing is fetched. Validators are cached by digest. |
| Kotlin | Generated validators plus `com.gruent.nodes.config.ConfigValidator` (kotlinx-serialization `JsonElement`, no compiler plugin) | Generated by `compiler/kotlin.go` |

`plugins/*/v*/fixtures` contain `{ "description", "config", "errors"? }` documents. All three suites must
report exactly the listed error pointers. `contracts/v1/fixtures` hold definition fixtures: Go and
TypeScript must reject each invalid one and report at least the listed pointers. Values that need more than
double precision are outside the tested range.

## Consumers

- **Go** (`github.com/ongruent/gruent/libs/engine/nodes`): `ParseDefinition`, `Definition.ValidateConfig`,
  `Definition.References` (named-select values minus static values, with resolved params), `Registry`
  (exact identity, immutable digests), `LoadPackage(dir)` (a `node.json` + `plugin.wasm` package with no
  generated code), and `LoadLibrary` (from the manifest, with digest checks).
  `plan.Validate`/`plan.Hydrate` check the DAG, configuration, I/O at both ends of each edge, and resource
  references through a `ResourceResolver`. They produce a `DeploymentPlan` with topologically ordered
  nodes, exact identities, digests, WASM artifacts, configuration, references, inputs/outputs, processing
  mode and resources.
- **TypeScript** (`@gruent/libs/engine/nodes/ts`): `Definition.parse`, `DefinitionRegistry`, `validateConfig`,
  `createConfig`, and a headless `<NodeConfig />` model in `form.ts`: `describeForm`, `isVisible`,
  `optionsEvent` (the `{path, name, query, params}` payload for `onOptionsSearch`/`onOptionsLoadMore`),
  `visibleOptions` and `selectedOptions` (unknown saved values keep an "(unavailable)" label). The parent
  owns fetching, auth, pagination, caching and stale-response handling. Only secret identifiers and labels
  cross this boundary, never secret values.
- **Kotlin** (`:libs:engine:nodes:kotlin`): `com.gruent.nodes.plugins.<type>.v<N>.<Type>Config` with a
  `Definition` companion (`pluginType`, `pluginVersion`, `definitionDigest`, `validate`, `decode`,
  `encode`). Each version has its own package, so several versions coexist on one classpath. Rendering
  annotations never become members.

## Publishing, versioning and ownership

- **Publishing.** A version is published when its `node.json` merges to `main` and appears in
  `generated/manifest.json` with its digest. After that, the definition is immutable. Fix mistakes,
  behavior-only releases and breaking changes alike by running `nx run nodes:new-version`. Registries in
  Go and TS refuse to re-register an identity with a different digest.
- **Resolution.** Channels persist `pluginType` + `pluginVersion`. Editors, Go validation, deployment plans
  and the Kotlin runtime all resolve that exact pair. Nothing resolves "latest", and a missing version is an
  error rather than a silent fallback.
- **Distributable packages.** A package needs only `node.json` + `plugin.wasm`. Generated Kotlin is a
  development asset for plugin authors, not a consumption requirement.
- **Generated files.** `generated/` belongs to the compiler. Never edit it by hand. Run `nx run nodes:compile`
  after changing a definition and commit the result. `nx run nodes:check` and the Go and Kotlin tests fail
  when it is stale.
- **Migration boundary.** Editing a channel never migrates it to a newer plugin version. There is no
  automatic upgrade in contract v1. An explicit, versioned migration mechanism (a mapping from version N to
  N+1 config, applied deliberately) must be designed before any published schema needs one. A future
  `contractVersion: 2` would get its own `contracts/v2` schema while v1 definitions keep validating.

## Open questions (not decided here)

- **Sizing and processing modes.** `plan.Policy` must be supplied by the caller. The plan carries the
  channel's existing `small | medium | large` tier plus whatever resources and processing mode the policy
  returns. The concrete CPU/memory policy and the processing-mode vocabulary still need to be specified.
- **Ports.** v1 edges connect nodes, not named ports. Conditional plugins with distinct pass/fail outputs
  need a port model before they can be expressed.
- **Integration.** The API endpoints, definition storage, WASM builds for Kotlin plugins, and the React
  `<NodeConfig />` component that uses `form.ts` are follow-up work.
