#!/bin/sh

# Set environment variables for Vault
export VAULT_ADDR='http://127.0.0.1:8200'
export VAULT_INIT_FILE='/mnt/vault/file/init.json'

# Start Vault server in the background
vault server -config=/vault/config/vault.hcl &

# Wait for Vault to be ready
while ! wget -q --spider http://127.0.0.1:8200/sys/health; do
  echo "Waiting for Vault to be ready..."
  sleep 2
done

echo "Vault server is online and ready"
vault status -format=json

# Check if the init file exists
if [ -f "$VAULT_INIT_FILE" ]; then
  echo "Vault init file exists. Loading unseal key and root token from $VAULT_INIT_FILE"
  UNSEAL_KEY=$(jq -r ".unseal_keys_b64[0]" "$VAULT_INIT_FILE")
  ROOT_TOKEN=$(jq -r ".root_token" "$VAULT_INIT_FILE")
  export UNSEAL_KEY
  export ROOT_TOKEN
else
  echo "Vault init file does not exist. Checking if Vault is initialized."
  # Check if Vault is initialized
  if [ "$(vault status -format=json | grep -o '"initialized": false')" ]; then
    echo "Initializing Vault"
    vault operator init -key-shares=1 -key-threshold=1 -format=json > "$VAULT_INIT_FILE"
    UNSEAL_KEY=$(jq -r ".unseal_keys_b64[0]" "$VAULT_INIT_FILE")
    ROOT_TOKEN=$(jq -r ".root_token" "$VAULT_INIT_FILE")
    export UNSEAL_KEY
    export ROOT_TOKEN
  else
    echo "Vault is already initialized but no init file exists. Exiting."
    exit 1
  fi
fi

# Unseal Vault
vault operator unseal "$UNSEAL_KEY"

# Login using the root token
vault login "$ROOT_TOKEN"

# Check if Userpass auth is already enabled
if vault auth list | grep -q "userpass/"; then
  echo "Userpass auth method is already enabled."
else
  echo "Enabling Userpass auth method..."
  vault auth enable userpass
fi

# Create EMQX user and policy
vault write auth/userpass/users/emqx password=gruent policies=emqx-container

echo '
path "kv/*" {
  capabilities = ["read", "list"]
}
' | vault policy write emqx-container -

# Create a service account and policy.
vault write auth/userpass/users/service password=gruent policies=service

echo '
path "kv/*" {
  capabilities = ["create", "read", "update", "patch", "delete", "list"]
}
' | vault policy write service -

# Create a rules-engine services user and policy
vault write auth/userpass/users/rules-engine password=gruent policies=rules-engine

echo '
path "kv/config/*" {
  capabilities = ["read"]
}

path "kv/spaces/*" {
  capabilities = ["read"]
}

path "kv/certs/*" {
  capabilities = ["read"]
}
' | vault policy write rules-engine -

# Create HTTP API user and policy
vault write auth/userpass/users/http-api password=gruent policies=http-api

echo '
path "kv/config/http-api" {
  capabilities = ["read"]
}

path "kv/spaces/*" {
  capabilities = ["create", "read", "update", "patch", "delete", "list"]
}

path "kv/certs/*" {
  capabilities = ["create", "read", "update", "patch", "delete", "list"]
}

path "pki/cert/ca" {
  capabilities = ["read"]
}

path "pki/issue/*" {
  capabilities = ["create", "read", "update", "patch", "delete", "list"]
}
' | vault policy write http-api -

# Create a tests services user and policy
vault write auth/userpass/users/tests password=gruent policies=tests

echo '
path "kv/config/tests" {
  capabilities = ["read"]
}
' | vault policy write tests -

# Setup KV engine
/vault/config/setup_vault_kv.sh

# Setup PKI engine
/vault/config/setup_vault_pki.sh

# Keep the container running
tail -f /dev/null
