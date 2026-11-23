# Step library (`libs/engine/steps`)

Versioned step plugin definitions, the shared contract they follow, and the compiler that turns them into
Kotlin configuration types. **`step.json` is the source of truth.** Kotlin is the only generated language. Go
and TypeScript read the original JSON, so a new plugin needs no per-plugin Go or TypeScript code and no
application rebuild.

```text
libs/engine/steps/
  contracts/v1/step-definition.schema.json   machine-readable envelope schema (contract v1)
  contracts/v1/fixtures/{valid,invalid}/     shared definition fixtures (Go + TS)
  plugins/<pluginType>/v<N>/step.json        definitions (immutable once published)
  plugins/<pluginType>/v<N>/fixtures/        shared config fixtures (Go + TS + Kotlin)
  compiler/                                  compile / create / new-version CLI (Go)
  generated/manifest.json                    GENERATED: identity -> definition + digest + Kotlin type
  generated/kotlin/                          GENERATED: Kotlin configuration types
  *.go                                       Go consumer: ingestion, validation, registry
  ts/                                        TypeScript consumer: ingestion, validation, resolver, form model
  kotlin/                                    Kotlin support library + tests for generated types
```

## Commands

| Command | What it does |
| --- | --- |
| `nx run steps:create --name=my-step [--category=action]` | Scaffolds `plugins/my-step/v1` with a valid empty definition and fixtures. If the step exists, it asks whether to create the next version instead (`--yes`/`--no` answer without prompting). |
| `nx run steps:new-version --name=my-step` | Copies the latest `v<N>` to `v<N+1>` and bumps `pluginVersion`. |
| `nx run steps:compile` | Validates every definition and fixture, then rewrites `generated/`. The compiler also accepts individual `step.json` files (`go run ./compiler compile path/step.json --out DIR`). |
| `nx run steps:check` | Fails if `generated/` is stale. Run it in CI. |
| `nx run steps:test` | Go, TypeScript and Kotlin suites over the same fixtures. |

## Definition envelope

```json
{
  "contractVersion": 1,
  "pluginType": "hello-world",
  "pluginVersion": 1,
  "displayName": "Hello world",
  "description": "…",
  "category": "processing",
  "configSchema": { "$schema": "https://json-schema.org/draft/2020-12/schema", "type": "object", "additionalProperties": false, "properties": { } }
}
```

See [`plugins/hello-world/v1/step.json`](plugins/hello-world/v1/step.json) for the canonical example, which
uses every control.

Decisions where the issue's proposal conflicted with itself:

- **`pluginType` vs category.** The proposal used `pluginType` twice. `pluginType` is the identity slug
  (`hello-world`), and `category` is the enum `source | processing | action | conditional | custom`. This
  matches the category of the previous node definitions and the legacy `ChannelNodeType`.
- **Versions are linear integers** (`pluginVersion: 1, 2, 3 …`, directories `v1`, `v2`, …), as required by
  `new-version`. Every version counts as a "major" version, so a breaking configuration change always gets a
  new version. Semantic version strings are rejected.
- **No connection rules in definitions.** The issue's `io.inputs`/`io.outputs` allowlists were dropped: no
  current step needs custom rules for which steps it may connect to. Definitions therefore say nothing about
  edges. Any step-specific connection rules belong to the interpretation layer for now; declarative
  constraints may be added to a later contract version if they become necessary.
- **Objects.** The only object is the configuration root. Object-valued fields are rejected, and
  dependencies such as models, secrets and connections are referenced by ID through named selects. Grouping is
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
| `array` | `items` (primitive `string`/`number`/`integer`, or `object` rows), `minItems`, `maxItems`, `uniqueItems` (not for rows), `default` | `multiselect` (string items, needs `options`), `list`, `objectList` (object items only) |

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
- A `multiselect` is one field: its option state is keyed by the array pointer (`/connectionIds`), and item
  errors are reported at `/connectionIds/<index>`.

**Rows (`objectList`).** An array whose `items` are `{ "type": "object", "additionalProperties": false,
"required": […], "properties": {…} }` is edited as repeatable rows, e.g. the comparisons of `compare@1`:

- Item fields follow the rules of top-level fields, but must be scalars (no nested arrays or objects) and
  cannot be grouped. Their `order` is unique within the item.
- An item field's `visibleWhen` refers to a sibling in the same row (`/compareTo`). Its named options'
  `paramsFromFields` refer to top-level fields (`/modelId`), so every row offers the same options.
- Item field `default`s initialize new rows in the editor; they are never applied when decoding.
- Each row field is addressed by its full pointer (`/comparisons/0/left`): option state, events, validation
  errors and `Definition.References` use it.
- Kotlin generates a nested `<Field>Item` data class with its own enums, validator and codec.
- `x-ui.keyField` names an item field (a required, always visible select with named options only) whose
  options each get one row, labelled by the option, e.g. one row per field of `transform@1`'s output model.
  The key's options are requested at the list's pointer (`/mappings`). A row is saved once another of its
  fields is set and removed when they are all cleared; saved rows whose key is no longer offered are shown
  as unavailable so they can be removed.

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
| Kotlin | Generated validators plus `com.gruent.steps.config.ConfigValidator` (kotlinx-serialization `JsonElement`, no compiler plugin) | Generated by `compiler/kotlin.go` |

`plugins/*/v*/fixtures` contain `{ "description", "config", "errors"? }` documents. All three suites must
report exactly the listed error pointers. `contracts/v1/fixtures` hold definition fixtures: Go and
TypeScript must reject each invalid one and report at least the listed pointers. Values that need more than
double precision are outside the tested range.

## Consumers

- **Go** (`github.com/ongruent/gruent/libs/engine/steps`): `ParseDefinition`, `Definition.ValidateConfig`,
  `Definition.References` (named-select values minus static values, with resolved params), `Registry`
  (exact identity, immutable digests), and `LoadLibrary` (from the manifest, with digest checks).
- **TypeScript** (`@gruent/libs/engine/steps/ts`): `Definition.parse`, `DefinitionRegistry`, `validateConfig`,
  `createConfig`, `DefinitionResolver` (runtime resolution, see below), and a headless form model in `form.ts`:
  `describeForm`, `isVisible`/`isFieldVisible`, `fieldIssues`, `withField`, `optionsEvent` (the
  `{path, name, query, params}` payload for `onOptionsSearch`/`onOptionsLoadMore`), `visibleOptions` and
  `selectedOptions` (unknown saved values keep an "(unavailable)" label). The parent owns fetching, auth,
  pagination, caching and stale-response handling. Only secret identifiers and labels cross this boundary,
  never secret values.
- **Kotlin** (`:libs:engine:steps:kotlin`): `com.gruent.steps.plugins.<type>.v<N>.<Type>Config` with a
  `Definition` companion (`pluginType`, `pluginVersion`, `definitionDigest`, `validate`, `decode`,
  `encode`). Each version has its own package, so several versions coexist on one classpath. Rendering
  annotations never become members.

## Rendering configuration (`<NodeConfig />`)

`<NodeConfig />` (`libs/frontend/src/components/NodeConfig`) is the only configuration editor. It has no
per-plugin code, widgets or overrides: every field is rendered from the original `configSchema` and its `x-ui`
annotations.

```tsx
<NodeDefinitionsProvider source={resolver}>
  <NodeConfig
    pluginType="hello-world"
    pluginVersion={1}
    value={config}
    namedOptions={namedOptions}       // NamedOptions from this library, keyed by field JSON Pointer
    onChange={setConfig}
    onOptionsSearch={search}          // ({ path, name, query, params }) => void
    onOptionsLoadMore={loadMore}      // same payload; pagination cursors stay in the parent
  />
</NodeDefinitionsProvider>
```

- **Resolution.** `DefinitionResolver` takes a loader for the manifest and for original definition bytes. It
  resolves only the exact `(pluginType, pluginVersion)` listed in the manifest, checks the bytes against the
  manifest digest, validates the definition against the contract (Ajv) and caches it by identity. A missing
  version or a failed check throws `UnsupportedDefinitionError`, and `<NodeConfig />` shows that error
  instead of a form. In the hub, `/api/node-definitions` serves `generated/manifest.json` and
  `/api/node-definitions/<type>/<version>` serves the original `step.json`. Both read the library from disk on
  every request (`GRUENT_NODE_LIBRARY_DIR`, which defaults to `libs/engine/steps`), so a published definition
  appears without rebuilding the hub.
- **Fields.** Labels come from `title`, help text from `description` and required markers from `required`.
  Groups render as fieldsets, and `visibleWhen` hides fields or groups. Validation messages come from the
  definition's Ajv validator. Messages for hidden fields, unknown keys and the root are listed in a summary,
  because hidden values are kept and still validated. The server stays authoritative.
- **Values.** The editor never writes on mount and never applies defaults. Defaults are applied only by
  `createConfig()` when a step is created from the library. Each edit changes one key and keeps every other
  key, including hidden and unknown ones. Clearing an input removes its key. Saved values of the wrong type
  are shown verbatim rather than dropped.
- **Selects.** Static-only selects need no parent data and emit no events. Named and mixed selects emit
  `onOptionsSearch` when they appear, when their query changes and when their `paramsFromFields` values
  change. The parent then resets items for the new query or parameters, but saved values stay. Static entries
  are listed first, are filtered locally, and stay visible while named data loads or fails. Saved values are
  labelled from static options, then `selectedItems`, then `items`. Anything else is shown as
  "(unavailable)" and is only removed by the user.
- **Field identity in repeated arrays.** The option-state key and event `path` is the field's JSON Pointer. A
  `multiselect` is a single field keyed by its array pointer (`/connectionIds`), and its item errors are reported at
  `/connectionIds/<index>`. `list` items are primitive values without options. Fields of `objectList` rows are
  keyed by their full pointer (`/comparisons/0/left`), so each row's selects have their own option state, and
  saved values are looked up at that pointer. Row field issues are shown next to the row field; issues of the
  rows themselves and of hidden row fields are shown under the list.

### Channel editor integration (hub)

- Steps created from the library persist `metadata.pluginType` and `metadata.pluginVersion` next to
  `metadata.config`. The editor resolves exactly that pair. Steps without them (created before the step
  library) are kept unchanged and reported as unsupported instead of being matched by name.
- Definitions declare no ports, so the canvas derives handles from the category: sources have one output
  (`output`), conditionals one input and two outputs (`success`, `failure`), and all other categories one
  input and one output.
- The step options pane is the `<NodeConfig />` parent. It fetches `models`, `connections` and `secrets` with the
  user's credentials through the API client, with per-field search, pagination, react-query caching,
  stale-response tokens and lookup of saved identifiers. Secrets expose only their names. Unknown collection
  names show an error on the field.
- `model-fields` is a field picker: the fields of the model selected in another field (`params.model`, usually
  through `paramsFromFields`), as paths relative to the input (`device.id`, `readings[].value`). With
  `params.scalars: true` it lists only single strings, numbers and booleans. The paths come from `modelFields`
  in `ts/`, which mirrors the controller's model types, so the controller accepts every path it offers. The
  controller ignores `model-fields` references and checks the paths itself.
- `input-fields` lists the fields of the step's input, as the controller infers it from the previous steps:
  the hub compiles the editor's draft channel (`POST /v1/channels/{id}/compile`) and reads the step's resolved
  input type (`typeFields` in `ts/`). If the input is unknown (no previous step) or has no fields (no model, a
  signal), the field shows why instead of options.

## Publishing, versioning and ownership

- **Publishing.** A version is published when its `step.json` merges to `main` and appears in
  `generated/manifest.json` with its digest. After that, the definition is immutable. Fix mistakes,
  behavior-only releases and breaking changes alike by running `nx run steps:new-version`. Registries in
  Go and TS refuse to re-register an identity with a different digest.
- **Resolution.** Channels persist `pluginType` + `pluginVersion`. Editors, Go and TS validation and the
  Kotlin runtime all resolve that exact pair. Nothing resolves "latest", and a missing version is an
  error rather than a silent fallback.
- **Generated files.** `generated/` belongs to the compiler. Never edit it by hand. Run `nx run steps:compile`
  after changing a definition and commit the result. `nx run steps:check` and the Go and Kotlin tests fail
  when it is stale.
- **Migration boundary.** Editing a channel never migrates it to a newer plugin version. There is no
  automatic upgrade in contract v1. An explicit, versioned migration mechanism (a mapping from version N to
  N+1 config, applied deliberately) must be designed before any published schema needs one. A future
  `contractVersion: 2` would get its own `contracts/v2` schema while v1 definitions keep validating.

## Open questions (not decided here)

- **Deployment plans.** Channel graph validation, plan hydration, sizing and processing modes are deferred
  to a separate issue once the plan format is defined. This library only validates definitions and
  configurations.
- **Connection rules and ports.** v1 definitions declare no I/O constraints. Output ports follow from the
  category instead: every conditional step has a `success` and a `failure` output, the controller rejects
  edges from a conditional step that leave from any other port, and the runtime delivers each message only
  along the edges of the branch the step sent it to (`StepMessage.port`, `ConditionalStep`). Steps that need
  other ports would need declarative ports in a later contract version.
- **Integration.** The hub serves definitions from the library directory and edits configuration with
  `<NodeConfig />` (see above). The API (`PATCH /v1/channels/validate`) and the controller validate saved
  library steps against the library embedded in their binaries (`steps.EmbeddedLibrary()`), and the
  controller compiles them into plans (see `services/controller/README.md`). The runtime (`services/runtime`)
  executes steps that have a Kotlin implementation module in `plugins/<type>/v<N>` (`build.gradle.kts` +
  `META-INF/services/com.gruent.steps.api.StepFactory`, see `api/`): today `timer-source@1`, `log@1`, `existence@1`, `compare@1` and `transform@1`. Plugin runtime artifacts (WASM) and
  custom/third-party step packages are out of scope: definitions carry no artifact fields.
