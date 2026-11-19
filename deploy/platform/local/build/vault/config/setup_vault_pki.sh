#!/bin/sh

# Check if the PKI secrets engine is enabled
if ! vault secrets list | grep -q "pki/"; then
  echo "Enabling PKI secrets engine..."
  vault secrets enable pki

  # Set the max lease TTL for the PKI engine
  vault secrets tune -max-lease-ttl=87600h pki
else
  echo "PKI secrets engine is already enabled."
fi

# Check if the root CA exists
if ! vault secrets list | grep -q "pki/root/generate/internal"; then
   # Generate the root CA certificate and key
  echo "Generating root CA..."
  vault write pki/root/generate/internal common_name="Gruent CA" ttl=87600h \
    key_type="ec" \
    key_bits="256" \
    country="US" province="CO" locality="Denver" organization="IOTEA Inc."

  # Configure the CA and CRL URLs
  vault write pki/config/urls \
      issuing_certificates="$VAULT_ADDR/v1/pki/ca" \
      crl_distribution_points="$VAULT_ADDR/v1/pki/crl"

  echo "Root CA has been generated."
else
  echo "Root CA has already been generated."
fi

# Check if a broker role and cert exists
if ! vault secrets list | grep -q "pki/issue/mqtt-broker"; then
  # Create a role for issuing broker certificates
  echo "Creating role for issuing broker certificates..."
  # TODO: Set allow_any_name to false when we discover how to properly get common names and SANs to work with EMQX
  vault write pki/roles/mqtt-broker \
      allowed_domains="localhost,emqx,emqx-mqtts.services.svc.cluster.local,mqtts.iotea.com" \
      allowed_domains_template=false \
      allow_subdomains=true \
      allow_ip_sans=true \
      allow_localhost=true \
      allow_glob_domains=false \
      allow_wildcard_certificates=true \
      allow_any_name=true \
      key_type="ec" \
      key_bits="256" \
      max_ttl="8760h"

  # Generate broker certificate
  generate_broker_cert() {
    local common_name=$1
    local alt_names=$2
    local ip_sans=$3

    echo "Generating broker certificate for ${common_name}..."

    # Generate broker private key and CSR
    cert_data=$(vault write -format=json pki/issue/mqtt-broker common_name="$common_name" alt_names="$alt_names" ip_sans="$ip_sans")
    echo "Broker certificate and key have been stored in PKI engine."

    # Extract the key, cert, and CA cert
    broker_key=$(echo $cert_data | jq -r '.data.private_key')
    broker_cert=$(echo $cert_data | jq -r '.data.certificate')
    ca_cert=$(echo $cert_data | jq -r '.data.issuing_ca')

    # Store the broker certificate and key in the KV engine
    vault kv put kv/mqtt-broker-cert private_key="$broker_key" certificate="$broker_cert" issuing_ca="$ca_cert"

    echo "Broker certificate and key have been stored in KV engine."
  }

  generate_broker_cert "localhost" "localhost,emqx,emqx-mqtts.services.svc.cluster.local,mqtts.gruent.io" "127.0.0.1"

  echo "Broker certificate generation complete."
else
  echo "Broker certificate has already been generated."
fi

# Check if a MQTT client role exists
echo "Creating role for issuing MQTT client certificates..."
# TODO: Set allow_any_name to false when we discover how to properly get common names and SANs to work with EMQX
vault write pki/roles/mqtt-client \
    allowed_domains="localhost,emqx,emqx-mqtts.services.svc.cluster.local,mqtts.gruent.io" \
    allowed_domains_template=false \
    allow_subdomains=true \
    allow_ip_sans=true \
    allow_localhost=true \
    allow_glob_domains=false \
    allow_wildcard_certificates=true \
    allow_any_name=true \
    key_type="ec" \
    key_bits="256" \
    max_ttl="8760h"

echo "MQTT client role created."
