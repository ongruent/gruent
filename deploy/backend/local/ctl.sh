#!/bin/bash

# Manages the backend Docker Compose stack: the API, the controller, and their
# supporting services.
#
#   ctl.sh up     start the stack and wait until every service is healthy
#   ctl.sh down   stop and remove the stack's containers (volumes are kept)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

NETWORK="gruent_network"
COMPOSE=(docker compose -f "$SCRIPT_DIR/docker-compose.yaml")

# Services that must be healthy before Vault is seeded and the API and
# controller start. Both load their configuration from Vault on startup.
SUPPORTING_SERVICES=(postgres redis nats vault clickhouse otel-collector minio inbucket)
APP_SERVICES=(controller http-api)

log() {
    echo "[backend] $*"
}

# Create local env files from their examples on first run
ensure_env_files() {
    local example target
    for example in "$SCRIPT_DIR"/.env*.example; do
        target="${example%.example}"
        if [ ! -f "$target" ]; then
            log "Creating ${target#"$SCRIPT_DIR/"} from ${example#"$SCRIPT_DIR/"}"
            cp "$example" "$target"
        fi
    done
}

ensure_network() {
    if ! docker network inspect "$NETWORK" >/dev/null 2>&1; then
        log "Creating Docker network $NETWORK"
        docker network create "$NETWORK" >/dev/null
    fi
}

up() {
    ensure_env_files
    ensure_network

    log "Starting supporting services"
    "${COMPOSE[@]}" up --build --detach --wait --wait-timeout 300 "${SUPPORTING_SERVICES[@]}"

    log "Seeding Vault"
    "$SCRIPT_DIR/seed-vault.sh"

    log "Starting the controller and API (the first start compiles both, which can take a few minutes)"
    "${COMPOSE[@]}" up --build --detach --wait --wait-timeout 900 "${APP_SERVICES[@]}"

    log "Backend is ready: API http://localhost:9001, controller localhost:9002"
}

down() {
    "${COMPOSE[@]}" down
}

case "${1:-}" in
up) up ;;
down) down ;;
*)
    echo "Usage: $0 {up|down}" >&2
    exit 1
    ;;
esac
