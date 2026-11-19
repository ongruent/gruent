# controller

Prepares channels for deployment. Kubernetes (kind for local development) is the only deployment target, but this service does not deploy anything yet.

`Publish` compiles the channel's stored configuration into two artifacts, uploads them to S3-compatible file storage (MinIO locally), and records them as the channel's desired state in `app.channel_deployments`:

- **Execution plan** (`internal/plan.ExecutionPlan`): the channel graph, source bindings, resolved models and connections, and runtime and deployment policies.
- **Routing artifact** (`internal/plan.RoutingArtifact`): source bindings, expected input models, concurrency limits, and the plan version they route to.

Each artifact version is the SHA-256 digest of its canonical JSON (`sha256:<hex>`), and the version is part of the storage key. An unchanged channel always produces the same version. Editor layout and the order of steps don't affect the version. Resource and concurrency values do.

## Resource and concurrency contract

These settings live in the channel configuration's `runtime` object. The controller doesn't fill them in with defaults.

| Field | Required | Meaning |
| --- | --- | --- |
| `memoryMiB` | yes | Static memory budget. The full budget is reserved (`memoryReservationMiB`), with no discount for low observed usage. |
| `maxConcurrentExecutions` | yes | Maximum number of in-flight executions. Runtimes enforce this limit; it is not an estimate. |
| `maxQueuedExecutions` | no (0) | Bounded queue for work that arrives while every execution slot is in use. |
| `maxInvocationMs` | no | Maximum execution time. |

Work that exceeds both limits is handled by each binding's `overflow`. HTTP sources reject it with `429`, and timer sources skip the tick. Sources that don't define overflow handling yet (MQTT, message queues) don't compile.

Dedicated and shared runtimes use the same contract. In a dedicated runtime, `memoryMiB` can be used as the container memory limit. In a shared JVM, the reservation only counts against the worker's capacity when scheduling (`plan.WorkerCapacity` subtracts runtime overhead and safety headroom). Channels on a shared worker aren't memory-isolated from each other.

## Deployment state

Uploading artifacts is not a deployment. The observed state (`observed_status`) stays `unknown` until a runtime acknowledges a version through `deployments.Service.RecordObserved`. `Status` returns `PUBLISHED` only after a runtime acknowledges the desired version. When compilation or upload fails, the failure is recorded (`preparation_status = failed`, with its stage and error), and the last successfully prepared version stays desired.

Delivering desired state to runtimes and source services (for example over NATS), pool provisioning, and Kubernetes reconciliation will be added with runtime integration.

## Tests

```bash
pnpm nx test controller
# Also run the Postgres integration test against a migrated database:
CONTROLLER_TEST_DATABASE_URL=postgresql://gruent:gruent@localhost:5432/gruent pnpm nx test controller
```
