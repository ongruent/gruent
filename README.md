# GRUENT

<a href="https://gruent.com" target="_blank" rel="noreferrer">
    <img alt="GRUENT logo" src="https://avatars.githubusercontent.com/u/129687839?s=200" width="75">
</a>

Connect systems with clarity.

## Overview

Our platform integrates with any network-connected device or service, enabling people to quickly turn bright ideas into practical solutions. We power yesterday, today, and tomorrow's connectivity solutions with our end-to-end platform and hardware.

## Getting started

This monorepo contains all of the code to make GRUENT work! Backend services, browser apps, mobile apps, device code, and internal tools/package all reside here.

Of course, tooling makes all of this easier to manage. We utilize [Nx](https://nx.dev/) to create, manage, and run all of our projects. For example, if you want to run the GRUENT browser app locally, simply clone this repo and run (after updating environment variables):

```bash
pnpm install
pnpm nx serve hub
```

and voila! - you are up and running with one of the various projects that make up our ecosystem.

## Local development stack

The full platform runs locally in containers. Runtime workers run in a local [kind](https://kind.sigs.k8s.io/) Kubernetes cluster, and everything else runs in the `platform` Docker Compose project, grouped into `backend` and `frontend` profiles. You need Docker and kind installed. Kubernetes is the only supported runtime deployment target; Compose only provides the supporting development stack.

| Command | Starts |
| --- | --- |
| `pnpm nx start platform` | The runtime cluster, then the backend, then the frontend |
| `pnpm nx start platform --profile=backend` | The runtime cluster, then the API, controller, Postgres, Redis, NATS, Vault, and observability services |
| `pnpm nx start platform --profile=frontend` | The hub (http://localhost:4200) and site (http://localhost:8001) dev servers |

Each stage waits until its services are ready before the next one starts, and creates any missing local env files from their `.env*.example` files. `pnpm nx stop platform` stops the whole stack and deletes the kind cluster; Docker volumes are kept. It also accepts `--profile`.

The kind node is attached to the `gruent_network` Docker network shared with the Compose services, which provides these connections:

- **Controller to Kubernetes API**: starting the runtime cluster creates a `controller` service account and writes a kubeconfig for it to `services/runtime/deploy/local/.generated/controller.kubeconfig`. The controller container uses it through `KUBECONFIG` to reach `https://gruent-control-plane:6443` with certificate verification.
- **API to runtime workers**: the API container routes the cluster's pod (`10.244.0.0/16`) and service (`10.96.0.0/16`) networks through the kind node, so it can proxy inbound requests to runtime workers by pod IP or ClusterIP. Cluster DNS is available at `10.96.0.10`.
- **Runtime workers to supporting services**: pods resolve Compose services by name, e.g. `nats:4222`, `redis:6379`, or `postgres:5432`.

Run `pnpm nx check platform` with the backend profile started to verify all three connections.

## Wiki & documentation

All technical and business documentation resides in [our Notion workspace](https://www.notion.so/gruent)! This includes:

- [Technical documents/diagrams](https://www.notion.so/gruent/Wiki-afc484a40b0d4920b7769901d52db35d?pvs=4)
- [RFCs](https://www.notion.so/gruent/RFCs-48d87759a5ea4872b7edd88cf02ce66c?pvs=4), an essential part of how we work together
- [Contributing guidelines](https://www.notion.so/gruent/Contributing-cecae423dadb44e88a05c78f0ef39819?pvs=4)
- Environment setup details
- Internal platform (testing, CI/CD, and deployment) guidelines
- Project-specific notes and guides
- Meeting notes
- Personal notes
- Business planning
- and so much more!
