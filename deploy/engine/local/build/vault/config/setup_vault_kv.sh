#!/bin/sh

# Check if the KV secrets engine is enabled
if ! vault secrets list | grep -q "kv/"; then
  echo "Enabling KV secrets engine..."
  vault secrets enable kv
else
  echo "KV secrets engine is already enabled."
fi
