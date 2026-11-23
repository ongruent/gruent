# runtime

Kotlin runtime workers that execute published channels. The controller deploys one worker per published
channel to Kubernetes (the local kind cluster in development); the worker loads the channel's signed plan
from artifact storage, consumes the channel's invocations from NATS, and executes the channel's DAG with
Kotlin coroutines and channels.

## End-to-end path (timer → log)

1. The user connects a **Timer** source (`timer-source@1`) to a **Log** action (`log@1`) in the hub and turns
   on **Publish**.
2. The controller compiles and uploads the artifacts (see `services/controller/README.md`) and then applies
   a worker for the plan version (`internal/runtimes`): a `runtime-artifact-storage` Secret and a
   `channel-<channel ID>` Deployment in the `gruent-runtime` namespace with `GRUENT_PLAN_KEY` and
   `GRUENT_PLAN_VERSION`.
3. The worker downloads the plan and its signature, verifies them against the controller's public key
   (`ARTIFACT_SIGNING_KEYRING`), builds the graph, and reports `applied` on
   `gruent.v1.runtime.observations.<channel ID>`. The controller records the observation, so the channel's
   status becomes `PUBLISHED`.
4. The worker schedules the plan's timer binding. Every tick publishes a timer `Invocation` to
   `gruent.v1.invocations.<channel ID>`, which the worker consumes (queue group `runtime.<channel ID>`),
   admits, and executes: the timer step emits a signal and the log step records it.
5. Execution traces and logs go to the shared OTel collector and ClickHouse tables, and the hub lists them
   through `GET /v1/channels/…/executions`.

## Configuration

| Variable | Meaning |
| --- | --- |
| `GRUENT_CHANNEL_ID`, `GRUENT_PLAN_KEY`, `GRUENT_PLAN_VERSION` | The plan to serve (set by the controller). |
| `ARTIFACT_SIGNING_KEYRING` | Trusted signing keys, `<key ID>=<base64 public key>,…`. |
| `ARTIFACT_STORAGE_ENDPOINT`, `_BUCKET`, `_REGION`, `_ACCESS_KEY_ID`, `_SECRET_ACCESS_KEY`, `_USE_SSL` | S3-compatible artifact storage. |
| `ARTIFACT_STORAGE_DIR` | Read artifacts from a local directory instead (local runs, tests). |
| `NATS_URL` | NATS server. Without it, invocations only flow within the process. |
| `OTEL_COLLECTOR_ENDPOINT` | OTLP/gRPC collector. Without it, execution telemetry is dropped. |
| `GRUENT_SHUTDOWN_GRACE_SECONDS` | How long a stopping worker drains in-flight executions (default 30). |

The controller's settings for workers are `RUNTIME_NAMESPACE`, `RUNTIME_IMAGE`,
`RUNTIME_IMAGE_PULL_POLICY`, `RUNTIME_NATS_URL`, `RUNTIME_OTEL_COLLECTOR_ENDPOINT`,
`RUNTIME_ARTIFACT_STORAGE_ENDPOINT` and `NATS_URL` (observations); see
`deploy/platform/local/.env.controller.example`. `pnpm nx start platform` builds the `gruent-runtime:local`
image and loads it into the kind cluster; `pnpm nx run runtime:image` rebuilds it after runtime changes.

```bash
pnpm nx test runtime   # runtime, timer-source and log step tests
pnpm nx build runtime  # build/install/runtime
```

## Decisions

**Step contract (`libs/engine/steps/api`).** The legacy Go node interface had `New`/`Init`/`Exec`/`Deinit`,
long-lived typed I/O channels wired with `Get/SetInput/OutputChans`, `IoData` values with a runtime data
type, and a notify channel through which nodes reported "input received" and "data processed" so the
runtime could tell when an execution finished. The Kotlin contract replaces it with:

- `StepFactory` per exact step library identity (`pluginType`, `pluginVersion`) with the
  `definitionDigest` of the generated configuration type. The runtime rejects a plan step whose pinned
  digest differs, and never resolves "latest". Factories are found with `ServiceLoader`, so built-in steps
  and future step packages register the same way. `create` validates and decodes the configuration with
  the generated type (replacing the legacy `setConfig` + validator).
- `Step.execute(input, output, context)` runs once per execution, as a coroutine, with Kotlin channels for
  input and output. Channels are created per execution, so completion is structural: a step's input closes
  when all upstream steps have returned, and the execution is complete when every step has returned. This
  removes the legacy notify channel and its "processed" counting. `MessageStep` covers the common
  per-message case.
- `SourceStep.receive(trigger)` turns an invocation into the first message. Sources don't own their
  trigger mechanism anymore: the controller compiles source configuration into bindings, and sources (the
  timer trigger here, source services later) produce invocations. The legacy timer's cron scheduler is
  therefore `sources/TimerTrigger`, and the timer step only records the tick and emits a signal.
- `StepMessage` is `SIGNAL` or `DATA` (bytes + content type), replacing the legacy `IoData` data types.
- `ExecutionContext` carries the execution ID, plan version, trigger and an `ExecutionLogger` scoped to the
  step, replacing the per-node tracer/meter/zerolog setup.
- The previous sketch's mutable `hostCtx`/`scope`/`config` fields and `stop()` that closed shared channels
  were dropped; step instances are created once per applied plan and released with `close()`.

**Execution.** One coroutine per step per execution, bounded channels (backpressure) with fan-out to every
downstream edge and fan-in by counting upstream completions, `withTimeout(maxInvocationMs)`, and failure of
any step cancelling the execution. `Admission` enforces `maxConcurrentExecutions` and
`maxQueuedExecutions`; work beyond both is overflow (timers skip the tick, HTTP answers 429 through the
reply). Invocations for another plan version, channel or binding are rejected.

**Timers run in the worker.** The routing contract assigns triggers to source services, which don't run
yet. Until they do, the worker schedules its plan's timer bindings and publishes the invocations to NATS
itself, so the timer path already goes through the same invocation subject, admission and execution as
other sources. Moving timers to a source service only removes `TimerTrigger` from the worker. The cron
syntax matches the controller's validation (robfig/cron with optional seconds and descriptors).

**One dedicated worker per channel**, `Recreate` strategy. Versions never run side by side (publish
strategy `replace`): the old worker stops admitting, drains within the termination grace period, and
reports `stopped`; the controller ignores `stopped` reports for versions that are no longer desired.

**Observability shares the platform pipeline.** Workers export traces and logs over OTLP to the same
collector and ClickHouse tables (`otel_traces`, `otel_logs`) as every other service, instead of a separate
collector and `channel_obsv` database. Resource attributes `gruent.workload=channel`, `gruent.org.id`,
`gruent.space.id` and `gruent.channel.id` identify channel telemetry; each execution is a root span
`channel.execution` (its trace ID is the execution ID) with `gruent.execution.status`, and each step a child
span `channel.step` with `gruent.step.id`, `gruent.step.name` and `gruent.step.type`. Log entries carry the
same attributes. The API lists executions from the root spans and reads an execution's logs by trace ID,
both filtered by these attributes and the space. The list's status filter takes a log level (the hub's
`info`/`error` tags: executions with a log entry at that level) or an execution status.

**Log step** (port of the legacy log node): logs at the configured level with the configured message (or
"Signal received"/"Input received"), and records the input in the `data` attribute: pretty JSON after
redaction, UTF-8 text, or base64. Redaction applies the plan's paths (`a.b`, `a[].b`) and fails closed: if
the input isn't JSON, the payload is omitted. A step with a sensitive fields model but no redaction paths
in the plan is rejected. Recorded data is capped at 64 KiB.

**Output ports.** A step can send a message through a named output (`StepMessage.toPort`); the executor then
delivers it only along the plan edges whose `fromPort` is that output, and a message without a port along
every edge. Conditional steps (`ConditionalStep`) send every input, unchanged, to `success` or `failure`.

**Existence step** (port of the legacy existence node): checks the plan step's `compiled.paths` (the
model's leaf fields, or the selected ones) in the JSON input and routes it to `success` when every field
(`match: all`) or at least one (`any`) is present. A path through an array needs every item to have the
field; null counts as missing unless `nullIsMissing` is false. Signals and input that isn't a JSON object go
to `failure`.

**Artifact access** uses a small SigV4 GetObject client instead of an S3 SDK, and the controller's
Ed25519 signature contract (`libs/engine/signing`) is implemented with the JDK.

## Limitations

- Only step library steps with a Kotlin implementation run: `timer-source@1`, `log@1` and
  `existence@1`. Other steps
  (including the HTTP and message queue sources) make the plan fail to apply, and the worker reports
  `failed`.
- Payloads are the trigger's raw bytes (JSON for HTTP and queues), not the FlatBuffers encoding the plan
  describes; the dependency bundle is not hydrated yet.
- HTTP replies: sync invocations answer 200 with no body (no response step yet), 504 on timeout and 500 on
  failure. Nothing subscribes HTTP/queue sources to NATS yet, and downstream events are not produced.
- Deploying happens during `Publish`: if Kubernetes is unreachable, publishing returns an error and must be
  retried; there is no periodic reconciliation of desired state, and the controller doesn't resync workers
  on startup.
- Workers get the controller's artifact storage credentials through a Secret; production needs read-only,
  scoped credentials (or presigned URLs).
- Timers run in the worker, so a worker with more than one replica would fire every tick once per replica.
  Workers are deployed with one replica.
