package things_test

import (
	"context"
	"testing"

	"github.com/go-playground/validator/v10"
	"github.com/ongruent/gruent/libs/legacy/engine/dependencies/things"
	"github.com/ongruent/gruent/libs/secrets"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type fakeSecrets struct {
	secrets.SecretsClient
	path   string
	values map[string]any
}

func (f *fakeSecrets) ReadKeyValue(_ context.Context, path string) (map[string]any, error) {
	f.path = path
	return f.values, nil
}

func (f *fakeSecrets) GetStringFromMap(values map[string]any, key string) string {
	value, _ := values[key].(string)
	return value
}

func TestNewPostgresServerFromAttributesAppliesDefaults(t *testing.T) {
	server, err := things.NewPostgresServerFromAttributes(map[string]any{
		"host": "db.internal", "database": "iot", "username": "gruent", "password": "PG_PASSWORD",
	})
	require.NoError(t, err)

	assert.Equal(t, 5432, server.Port)
	assert.Equal(t, "prefer", server.SSLMode)
	assert.Equal(t, things.PostgresServerThingCategory, server.Category())

	// The stored attributes keep the secret's name and match what the controller and runtime read.
	stored, err := server.MarshalJson()
	require.NoError(t, err)
	assert.JSONEq(t, `{"host":"db.internal","port":5432,"database":"iot","username":"gruent","password":"PG_PASSWORD","sslMode":"prefer"}`, string(stored))
}

func TestNewPostgresServerFromAttributesRejectsInvalidAttributes(t *testing.T) {
	valid := map[string]any{"host": "10.0.0.5", "port": 6543, "database": "iot", "username": "gruent", "sslMode": "require"}
	_, err := things.NewPostgresServerFromAttributes(valid)
	require.NoError(t, err)

	for name, change := range map[string]map[string]any{
		"missing host":     {"host": ""},
		"invalid host":     {"host": "not a host"},
		"missing database": {"database": ""},
		"missing username": {"username": ""},
		"port too large":   {"port": 70000},
		"unknown ssl mode": {"sslMode": "always"},
	} {
		t.Run(name, func(t *testing.T) {
			attributes := map[string]any{}
			for key, value := range valid {
				attributes[key] = value
			}
			for key, value := range change {
				attributes[key] = value
			}
			_, err := things.NewPostgresServerFromAttributes(attributes)
			var validationErrors validator.ValidationErrors
			assert.ErrorAs(t, err, &validationErrors)
		})
	}

	_, err = things.NewPostgresServerFromAttributes(map[string]any{"host": "db", "port": "5432", "database": "iot", "username": "u"})
	assert.Error(t, err, "a non-numeric port is rejected")
}

func TestPostgresServerResolvePassword(t *testing.T) {
	client := &fakeSecrets{values: map[string]any{"PG_PASSWORD": "s3cret"}}

	server := &things.PostgresServer{Password: "PG_PASSWORD"}
	password, err := server.ResolvePassword(client, "spc_1")
	require.NoError(t, err)
	assert.Equal(t, "s3cret", password)
	assert.Equal(t, "spaces/spc_1", client.path)
	assert.Equal(t, "PG_PASSWORD", server.Password, "resolving doesn't replace the secret name")

	_, err = (&things.PostgresServer{Password: "MISSING"}).ResolvePassword(client, "spc_1")
	assert.ErrorContains(t, err, `"MISSING" does not exist`)

	client.path = ""
	password, err = (&things.PostgresServer{}).ResolvePassword(client, "spc_1")
	require.NoError(t, err)
	assert.Empty(t, password)
	assert.Empty(t, client.path, "no secrets are read without a password")
}

func TestPostgresServerIsListable(t *testing.T) {
	category, ok := things.ParseCategoryString("POSTGRES_SERVER")
	require.True(t, ok)
	assert.Equal(t, things.PostgresServerThingCategory, *category)
}

// Creating and updating a connection both store what NewPostgresServerForSpace returns.
func TestNewPostgresServerForSpaceKeepsThePasswordSecretReference(t *testing.T) {
	client := &fakeSecrets{values: map[string]any{"PG_PASSWORD": "s3cret"}}
	attributes := map[string]any{
		"host": "postgres", "port": float64(5432), "database": "iot", "username": "gruent",
		"password": "PG_PASSWORD", "sslMode": "disable",
	}

	server, err := things.NewPostgresServerForSpace(attributes, client, "spc_1")
	require.NoError(t, err)
	assert.Equal(t, "spaces/spc_1", client.path, "the secret is checked in the connection's space")

	stored, err := server.MarshalJson()
	require.NoError(t, err)
	assert.JSONEq(t, `{"host":"postgres","port":5432,"database":"iot","username":"gruent","password":"PG_PASSWORD","sslMode":"disable"}`, string(stored))
	assert.NotContains(t, string(stored), "s3cret", "the secret's value is never stored")
}

func TestNewPostgresServerForSpaceAllowsNoPassword(t *testing.T) {
	client := &fakeSecrets{values: map[string]any{}}
	for name, password := range map[string]any{"omitted": nil, "empty": ""} {
		t.Run(name, func(t *testing.T) {
			attributes := map[string]any{"host": "postgres", "database": "iot", "username": "gruent"}
			if password != nil {
				attributes["password"] = password
			}

			server, err := things.NewPostgresServerForSpace(attributes, client, "spc_1")
			require.NoError(t, err)

			stored, err := server.MarshalJson()
			require.NoError(t, err)
			assert.NotContains(t, string(stored), "password")
		})
	}
	assert.Empty(t, client.path, "no secrets are read without a password")
}

func TestNewPostgresServerForSpaceRejectsUnknownSecrets(t *testing.T) {
	client := &fakeSecrets{values: map[string]any{"OTHER": "value"}}
	_, err := things.NewPostgresServerForSpace(map[string]any{
		"host": "postgres", "database": "iot", "username": "gruent", "password": "PG_PASSWORD",
	}, client, "spc_1")
	assert.ErrorContains(t, err, `"PG_PASSWORD" does not exist`)

	_, err = things.NewPostgresServerForSpace(map[string]any{"host": "postgres"}, client, "spc_1")
	var validationErrors validator.ValidationErrors
	assert.ErrorAs(t, err, &validationErrors)
}
