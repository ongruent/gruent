#!/bin/bash

# Manages the frontend Docker Compose stack: the hub and site apps.
#
#   ctl.sh up     start the apps and wait until they accept connections
#   ctl.sh down   stop and remove the apps' containers

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

NETWORK="gruent_network"
COMPOSE=(docker compose -f "$SCRIPT_DIR/docker-compose.yaml")
APPS=(hub site)

log() {
    echo "[frontend] $*"
}

# Create local env files from their examples on first run
ensure_env_files() {
    local app
    for app in "${APPS[@]}"; do
        if [ ! -f "$REPO_ROOT/apps/$app/.env" ] && [ -f "$REPO_ROOT/apps/$app/.env.example" ]; then
            log "Creating apps/$app/.env from apps/$app/.env.example"
            cp "$REPO_ROOT/apps/$app/.env.example" "$REPO_ROOT/apps/$app/.env"
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

    log "Starting hub and site (the first start installs dependencies, which can take a few minutes)"
    "${COMPOSE[@]}" up --detach --wait --wait-timeout 900 "${APPS[@]}"

    log "Frontend is ready: hub http://localhost:4200, site http://localhost:8001"
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
