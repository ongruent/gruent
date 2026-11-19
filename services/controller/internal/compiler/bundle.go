package compiler

import (
	"encoding/json"
	"fmt"
	"slices"

	"github.com/ongruent/gruent/services/controller/internal/plan"
)

// connectionFields lists, per connection category, the attributes whose values are the names of secrets
// in the space's key-value secrets, the attributes that hold certificate IDs, and the attributes that
// must never leave the database. Categories that are not listed have unknown sensitive fields, so their
// attributes are not embedded at all.
var connectionFields = map[string]struct {
	secrets      []string
	certificates []string
	stripped     []string
}{
	"HTTP_SERVER":         {},
	"MQTT_BROKER":         {}, // caCertificate is a public CA certificate
	"MQTT_CLIENT":         {secrets: []string{"password"}, certificates: []string{"certificateId"}, stripped: []string{"keypair"}},
	"MONGODB_SERVER":      {secrets: []string{"password"}},
	"S3_BUCKET":           {secrets: []string{"AwsSecretAccessKey"}},
	"MINIO_BUCKET":        {secrets: []string{"MinioSecretAccessKey"}},
	"AWS_SNS_ENDPOINT":    {secrets: []string{"AwsSecretAccessKey"}},
	"AWS_SES_ENDPOINT":    {secrets: []string{"AwsSecretAccessKey"}},
	"SENDGRID_CLIENT":     {secrets: []string{"apiKey"}},
	"INFLUXDB_DATABASE":   {secrets: []string{"token"}},
	"CLICKHOUSE_DATABASE": {secrets: []string{"password"}},
}

// SecretRef returns the reference of a secret in a space's key-value secrets.
func SecretRef(spaceID, key string) string {
	return fmt.Sprintf("secretref://vault/spaces/%s#%s", spaceID, key)
}

// CertificateRef returns the reference of a certificate.
func CertificateRef(spaceID, certificateID string) string {
	return fmt.Sprintf("certref://spaces/%s/certificates/%s", spaceID, certificateID)
}

// bundleConnection converts a stored connection into a bundle entry. Values of secret and certificate
// fields are replaced by references, and stripped fields are removed.
func bundleConnection(spaceID string, record ConnectionRecord) (plan.Connection, error) {
	connection := plan.Connection{
		ID:                record.ID,
		Name:              record.Name,
		Category:          record.Category,
		Revision:          record.Revision,
		Attributes:        plan.RawJSON("null"),
		SecretFields:      map[string]string{},
		CertificateFields: map[string]string{},
	}
	fields, known := connectionFields[record.Category]
	if !known {
		return connection, nil
	}

	var attributes map[string]any
	if err := json.Unmarshal(record.Attributes, &attributes); err != nil {
		return plan.Connection{}, fmt.Errorf("connection %s has invalid attributes: %w", record.ID, err)
	}
	for _, name := range fields.stripped {
		delete(attributes, name)
	}
	for _, name := range fields.secrets {
		if key, ok := attributes[name].(string); ok && key != "" && key != unsetReference {
			connection.SecretFields[name] = SecretRef(spaceID, key)
		}
		delete(attributes, name)
	}
	for _, name := range fields.certificates {
		if id, ok := attributes[name].(string); ok && id != "" && id != unsetReference {
			connection.CertificateFields[name] = CertificateRef(spaceID, id)
		}
		delete(attributes, name)
	}

	encoded, err := json.Marshal(attributes)
	if err != nil {
		return plan.Connection{}, err
	}
	canonical, err := plan.Canonicalize(encoded)
	if err != nil {
		return plan.Connection{}, err
	}
	connection.Attributes = canonical
	return connection, nil
}

// sensitiveReferences lists the secrets and certificates the connections need, with the connections that
// use them.
func sensitiveReferences(connections []plan.Connection) ([]plan.Secret, []plan.Certificate) {
	secretUsers := map[string][]string{}
	certificateUsers := map[string][]string{}
	for _, connection := range connections {
		for _, ref := range connection.SecretFields {
			secretUsers[ref] = appendUnique(secretUsers[ref], connection.ID)
		}
		for _, ref := range connection.CertificateFields {
			certificateUsers[ref] = appendUnique(certificateUsers[ref], connection.ID)
		}
	}

	secrets := []plan.Secret{}
	for _, ref := range sortedKeys(secretUsers) {
		users := secretUsers[ref]
		slices.Sort(users)
		secrets = append(secrets, plan.Secret{Ref: ref, UsedBy: users})
	}
	certificates := []plan.Certificate{}
	for _, ref := range sortedKeys(certificateUsers) {
		users := certificateUsers[ref]
		slices.Sort(users)
		certificates = append(certificates, plan.Certificate{Ref: ref, ID: lastSegment(ref), UsedBy: users})
	}
	return secrets, certificates
}

func lastSegment(ref string) string {
	for i := len(ref) - 1; i >= 0; i-- {
		if ref[i] == '/' {
			return ref[i+1:]
		}
	}
	return ref
}
