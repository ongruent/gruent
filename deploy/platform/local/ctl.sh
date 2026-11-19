#!/bin/bash

# Manages the local development platform: the kind cluster that hosts runtime
# workers, and the Docker Compose stack that runs everything else.
#
#   ctl.sh up [--profile=PROFILE]     start the platform and wait until it is ready
#   ctl.sh down [--profile=PROFILE]   stop the platform (volumes are kept)
#   ctl.sh check                      verify networking between the cluster
#                                     and the backend services
#
# Profiles:
#   all (default)  the runtime cluster, then the backend, then the frontend
#   backend        the runtime cluster, then the backend services
#   frontend       the frontend apps only

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
RUNTIME_CTL="$REPO_ROOT/services/runtime/deploy/local/ctl.sh"

NETWORK="gruent_network"
COMPOSE=(docker compose -f "$SCRIPT_DIR/docker-compose.yaml")

# Backend services that must be healthy before Vault is seeded and the API
# and controller start. Both load their configuration from Vault on startup.
SUPPORTING_SERVICES=(postgres redis nats vault clickhouse otel-collector minio inbucket)
BACKEND_APPS=(controller http-api)
FRONTEND_APPS=(hub site)

log() {
    echo "[platform] $*"
}

fail() {
    echo "[platform] error: $*" >&2
    exit 1
}

usage() {
    echo "Usage: $0 {up|down} [--profile=all|backend|frontend]" >&2
    echo "       $0 check" >&2
    exit 1
}

ensure_network() {
    if ! docker network inspect "$NETWORK" >/dev/null 2>&1; then
        log "Creating Docker network $NETWORK"
        docker network create "$NETWORK" >/dev/null
    fi
}

# Copies $1.example to $1 on first run
ensure_env_file() {
    local target="$1"
    if [ ! -f "$target" ] && [ -f "$target.example" ]; then
        log "Creating ${target#"$REPO_ROOT/"} from ${target#"$REPO_ROOT/"}.example"
        cp "$target.example" "$target"
    fi
}

start_runtime() {
    log "Starting the runtime cluster"
    "$RUNTIME_CTL" up
}

start_backend() {
    local example
    for example in "$SCRIPT_DIR"/.env*.example; do
        ensure_env_file "${example%.example}"
    done

    log "Starting backend supporting services"
    "${COMPOSE[@]}" up --build --detach --wait --wait-timeout 300 "${SUPPORTING_SERVICES[@]}"

    log "Seeding Vault"
    "$SCRIPT_DIR/seed-vault.sh"

    log "Starting the controller and API (the first start compiles both, which can take a few minutes)"
    "${COMPOSE[@]}" up --build --detach --wait --wait-timeout 900 "${BACKEND_APPS[@]}"

    log "Backend is ready: API http://localhost:9001, controller localhost:9002"
}

start_frontend() {
    local app
    for app in "${FRONTEND_APPS[@]}"; do
        ensure_env_file "$REPO_ROOT/apps/$app/.env"
    done

    log "Starting hub and site (the first start installs dependencies, which can take a few minutes)"
    "${COMPOSE[@]}" up --detach --wait --wait-timeout 900 "${FRONTEND_APPS[@]}"

    log "Frontend is ready: hub http://localhost:4200, site http://localhost:8001"
}

up() {
    ensure_network
    case "$1" in
    all)
        start_runtime
        start_backend
        start_frontend
        ;;
    backend)
        start_runtime
        start_backend
        ;;
    frontend)
        start_frontend
        ;;
    esac
}

down() {
    case "$1" in
    all)
        "${COMPOSE[@]}" --profile '*' down
        "$RUNTIME_CTL" down
        ;;
    backend)
        "${COMPOSE[@]}" --profile backend down
        "$RUNTIME_CTL" down
        ;;
    frontend)
        "${COMPOSE[@]}" --profile frontend down
        ;;
    esac
}

command="${1:-}"
[ "$#" -gt 0 ] && shift

profile="all"
while [ "$#" -gt 0 ]; do
    case "$1" in
    --profile=*) profile="${1#--profile=}" ;;
    --profile)
        [ "$#" -gt 1 ] || usage
        profile="$2"
        shift
        ;;
    *) usage ;;
    esac
    shift
done

case "$profile" in
all | backend | frontend) ;;
*) fail "unknown profile '$profile'; expected all, backend, or frontend" ;;
esac

case "$command" in
up) up "$profile" ;;
down) down "$profile" ;;
check) "$RUNTIME_CTL" check ;;
*) usage ;;
esac
