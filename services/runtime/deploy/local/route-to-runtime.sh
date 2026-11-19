#!/bin/sh

# Routes the runtime cluster's pod and service networks through the kind
# control plane node, so a container on `gruent_network` (the API) can reach
# runtime workers by pod IP or ClusterIP. This is what lets the API proxy
# inbound requests, such as HTTP source triggers, to runtime workers.
#
# The container needs the NET_ADMIN capability and the `ip` command. Missing
# routes are not fatal: if the cluster isn't running yet, `pnpm nx start
# platform` runs this script in the API container once the cluster is ready.
#
# Usage:
#   route-to-runtime.sh                 add the routes
#   route-to-runtime.sh --exec CMD...   add the routes, then exec CMD

set -u

# Keep in sync with ./kind-config.yaml
NODE="${RUNTIME_CLUSTER_NODE:-gruent-control-plane}"
CIDRS="${RUNTIME_CLUSTER_CIDRS:-10.244.0.0/16 10.96.0.0/16}"

add_routes() {
    node_ip="$(getent ahostsv4 "$NODE" 2>/dev/null | awk 'NR == 1 { print $1 }')"
    if [ -z "$node_ip" ]; then
        echo "route-to-runtime: $NODE is not reachable; skipping runtime routes (run \`pnpm nx start platform\`)" >&2
        return 1
    fi

    for cidr in $CIDRS; do
        if ! ip route replace "$cidr" via "$node_ip"; then
            echo "route-to-runtime: failed to route $cidr via $node_ip" >&2
            return 1
        fi
        echo "route-to-runtime: routed $cidr via $NODE ($node_ip)"
    done
}

if [ "${1:-}" = "--exec" ]; then
    shift
    add_routes || true
    exec "$@"
fi

add_routes
