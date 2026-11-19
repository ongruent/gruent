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
  ts/                                        TypeScript consumer: ingestion, validation, form model
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
- A `multiselect` is one field: its option state is keyed by the array pointer (`/connectionIds`), and item
  errors are reported at `/connectionIds/<index>`. Selectors inside array items are not supported in v1.

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
  `createConfig`, and a headless `<StepConfig />` model in `form.ts`: `describeForm`, `isVisible`,
  `optionsEvent` (the `{path, name, query, params}` payload for `onOptionsSearch`/`onOptionsLoadMore`),
  `visibleOptions` and `selectedOptions` (unknown saved values keep an "(unavailable)" label). The parent
  owns fetching, auth, pagination, caching and stale-response handling. Only secret identifiers and labels
  cross this boundary, never secret values.
- **Kotlin** (`:libs:engine:steps:kotlin`): `com.gruent.steps.plugins.<type>.v<N>.<Type>Config` with a
  `Definition` companion (`pluginType`, `pluginVersion`, `definitionDigest`, `validate`, `decode`,
  `encode`). Each version has its own package, so several versions coexist on one classpath. Rendering
  annotations never become members.

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
- **Connection rules and ports.** v1 definitions declare no I/O constraints, and edges connect steps, not
  named ports. Conditional plugins with distinct pass/fail outputs need a port model before they can be
  expressed.
- **Integration.** The API endpoints, definition storage and the React `<StepConfig />` component that uses
  `form.ts` are follow-up work. Plugin runtime artifacts (WASM) and custom/third-party step packages are out
  of scope: definitions carry no artifact fields.
