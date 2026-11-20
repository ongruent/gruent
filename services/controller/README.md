# controller

Compiles channels into signed, versioned artifacts and records their desired deployment state. It replaces the legacy `orchestrator`, which worked differently. Kubernetes (with kind for local development) is the only deployment target, but this service does not deploy anything yet.

## Artifacts

`Publish` compiles a channel's saved configuration into four artifacts:

| Artifact | Contents | Consumer |
| --- | --- | --- |
| **Plan** (`plan.Plan`) | Channel graph, publish strategy, bindings, payload types, runtime and deployment policies, and metadata. Pins the versions of its dependency bundle and payload schema. | Runtimes |
| **DependencyBundle** (`plan.DependencyBundle`) | Models, connections, and references to secrets and certificates. | Runtimes (hydration) |
| **Payload schema** (`.fbs`) | FlatBuffers tables for every step input and output, and for every model. | Runtimes |
| **Routing** (`routing.Artifact`) | Source bindings, expected input models, and concurrency limits. Pins the plan version. | Source services |

An artifact's identity is its kind plus its version, which is `sha256:<hex>` of the artifact's canonical content. The storage key is derived from that identity (`orgs/<org>/spaces/<space>/channels/<channel>/<kind>/<hex>.json|.fbs`). Artifacts are never overwritten. An unchanged channel always compiles to the same versions. Editor layout and step order don't affect versions; resource and concurrency values do.

A delivery URL is not part of the identity. Later deployment integration will give runtimes short-lived presigned URLs (`artifacts.Presigner`).

### Signing

Each artifact has a detached Ed25519 signature at `<key>.sig` (`signing.Envelope`). The signed message binds the artifact kind to its digest. To verify an artifact, a consumer:

1. Checks that the artifact's digest matches the version it expected.
2. Checks the envelope's format, algorithm and kind.
3. Looks up the key ID in its keyring of trusted public keys.
4. Verifies the signature.

Because a verified plan pins the other artifacts' versions, verifying the plan secures the whole set. See `internal/signing` for the full contract and key rotation. The controller reads its key from `ARTIFACT_SIGNING_KEY_ID` and `ARTIFACT_SIGNING_PRIVATE_KEY` (a base64 Ed25519 seed) and logs its public key on startup.

### Dependency hydration

Models are embedded in the bundle. Connections are embedded with their sensitive values removed:

- Secret fields become `secretref://vault/spaces/<space>#<key>` references.
- Certificate fields become `certref://spaces/<space>/certificates/<id>` references.
- Fields such as client private keys are dropped.
- Connections whose category has unknown sensitive fields are embedded without attributes. Runtimes load them by ID and revision instead.

Runtimes resolve secret and certificate references with their own credentials when they apply a plan. Rotating a secret therefore changes no artifact. See the `plan.DependencyBundle` docs.

## Payload types

At runtime, step inputs and outputs are `ByteArray`s holding FlatBuffer data. The controller resolves each step's types from the source's declared model and propagates them through the graph using step type contracts (`internal/types`):

- A timer emits a signal.
- Other sources emit their model, or raw bytes if they don't declare one.
- A transform must declare `outputModel::model`.
- Every other step passes its input through, unless it declares an output model.
- A step that declares `inputModel::model` requires its input to be assignable to that model.
- Edges must carry a data type the target step accepts.

FlatBuffer schemas are generated from the resolved types (`internal/flatbuffers`), separately from inference. Each step also gets a list of `variables` (for example `input.device.temperatureC`), so frontend tooling can offer variable references and type-check string templates.

## Soft compilation

`Compile` (gRPC), exposed as `POST /v1/channels/:channelId/compile?spaceId=…`, runs the same validation and type resolution as `Publish`. It returns diagnostics (`severity`, `code`, `message`, `stepId`, `path`), the resolved types, and the versions that publishing would produce. It never uploads artifacts, records state, or contacts a runtime. The request body is one of:

- empty: compile the saved configuration;
- `{"config": …}`: compile a draft configuration;
- `{"step": …, "upstreamType": …}`: compile a single step. `upstreamType` is the upstream step's `output` type from an earlier compilation; omit it for sources.

## Resource and concurrency contract

These settings live in the channel configuration's `runtime` object. The controller doesn't fill them in with defaults.

| Field | Required | Meaning |
| --- | --- | --- |
| `memoryMiB` | yes | Static memory budget. The full budget is reserved (`memoryReservationMiB`), with no discount for low observed usage. |
| `maxConcurrentExecutions` | yes | Maximum number of in-flight executions. Runtimes enforce this limit; it is not an estimate. |
| `maxQueuedExecutions` | no (0) | Bounded queue for work that arrives while every execution slot is in use. |
| `maxInvocationMs` | no | Maximum execution time. |

Work that exceeds both limits is handled by each binding's `overflow`. HTTP sources reject it with `429`, timer sources skip the tick, and message queue sources pause consumption so messages wait in the broker. Sources that don't define overflow handling yet (MQTT) don't compile.

Dedicated and shared runtimes use the same contract. In a dedicated runtime, `memoryMiB` can be used as the container memory limit. In a shared JVM, the reservation only counts against the worker's capacity when scheduling (`plan.WorkerCapacity` subtracts runtime overhead and safety headroom). Channels on a shared worker aren't memory-isolated from each other.

The plan's publish strategy is `replace`. A runtime that applies a new version stops admitting work to the previous version, lets in-flight executions finish, and then switches to the new version.

## Step library steps

Steps created from the step library (`libs/engine/steps`) carry `metadata.pluginType` and `metadata.pluginVersion`. The compiler resolves that exact definition from the library embedded in the binary, validates the configuration against its schema (errors are reported at `/config/<field>`), and pins the definition's digest in the plan step (`definition`). Their dependencies are the values of named selects: `models` and `connections`. A source's model field declares its output; other steps use `inputModelId` and `outputModelId`. Library steps declare no ports, so their inputs accept any type.

The library source steps compile into bindings:

| Step | Binding |
| --- | --- |
| `http-source@1` | `method`, `responseMode` (`sync` waits up to `responseTimeout` seconds for the reply; `async` answers 202 once a runtime admits the execution), path `/v1/trigger/http/<channel ID>` |
| `timer-source@1` | `cronExpression` (5 fields, optional leading seconds field, or a descriptor), evaluated in UTC |
| `message-queue-source@1` | `broker` (`NATS_CLIENT` or `KAFKA_CONSUMER`), a connection of that category, and the subject or topic |

Every binding names the channel's invocation subject (`gruent.v1.invocations.<channel ID>`).

The `log@1` action records its input at the configured `level`, with an optional `message`. Its optional `redactionModelId` selects a model whose every field is sensitive. The compiler resolves it into the plan step's `redaction` (paths such as `card.number` or `readings[].token`, replaced with `[REDACTED]`) and adds the model to the dependency bundle. The step's input type is unchanged. Warnings report sensitive fields that the input type doesn't have, and inputs without a model, which can't be checked. Redaction fails closed: input that can't be parsed as JSON is logged without its payload.

## Routing table

Source services never read Postgres. After recording a published version, the controller writes the channel's signed route table entry (`routing.Entry`) to `routing/v1/channels/<channel ID>.json`. It points to the routing artifact; unpublishing deletes it. Source services list these entries, verify each entry and routing artifact, and reconcile an in-memory table (`routing.Reconciler`). An entry that fails verification never changes routing: the previous routes stay until a later reconciliation succeeds.

`libs/engine/routing` also defines the `Invocation` message that sources publish to the binding's subject and the `Reply` that runtimes answer with, and `routing.Ingress`, the HTTP source that matches requests against the table and uses request/reply. Running source services, scheduling timers, consuming queues, and runtimes subscribing to invocation subjects are later runtime work.

## Deployment state

Uploading artifacts is not a deployment. The observed state (`observed_status`) stays `unknown` until a runtime acknowledges a plan version through `deployments.Service.RecordObserved`. `Status` returns `PUBLISHED` only after a runtime acknowledges the desired version. When compilation or upload fails, the failure is recorded (`preparation_status = failed`, with its stage and error), and the last successfully prepared version stays desired.

Delivering desired state and presigned URLs to runtimes (for example over NATS), pool provisioning, and Kubernetes reconciliation will be added with runtime integration.

## Tests

```bash
pnpm nx test controller
# Also run the Postgres integration test against a migrated database:
CONTROLLER_TEST_DATABASE_URL=postgresql://gruent:gruent@localhost:5432/gruent pnpm nx test controller
```

If `flatc` is installed, the tests also compile the generated FlatBuffers schemas with it.
