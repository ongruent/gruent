package things

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/go-playground/validator/v10"
	"github.com/ongruent/gruent/libs/secrets"
)

const PostgresServerThingCategory ThingCategory = "POSTGRES_SERVER"

const (
	DefaultPostgresPort    = 5432
	DefaultPostgresSSLMode = "prefer"
)

// PostgresServer is a connection to a PostgreSQL database, used by the relational-db@1 step.
//
// Password holds the name of a secret in the space's key-value secrets, never its value: the controller
// turns it into a secret reference when it bundles the connection, and the runtime resolves it. An empty
// password connects without one.
type PostgresServer struct {
	Host     string `json:"host" validate:"required,hostname|ip"`
	Port     int    `json:"port" validate:"required,min=1,max=65535"`
	Database string `json:"database" validate:"required"`
	Username string `json:"username" validate:"required"`
	Password string `json:"password,omitempty"`
	SSLMode  string `json:"sslMode" validate:"required,oneof=disable allow prefer require verify-ca verify-full"`
}

// NewPostgresServerFromAttributes reads and validates PostgreSQL connection attributes. The port defaults
// to 5432 and the SSL mode to "prefer". Unlike the other database connections, the password is kept as the
// secret's name; use ResolvePassword to read its value.
func NewPostgresServerFromAttributes(attributes map[string]any) (*PostgresServer, error) {
	jsonAttributes, err := json.Marshal(attributes)
	if err != nil {
		return nil, err
	}
	var postgresServer PostgresServer
	if err := json.Unmarshal(jsonAttributes, &postgresServer); err != nil {
		return nil, fmt.Errorf("invalid PostgreSQL connection attributes: %w", err)
	}

	if postgresServer.Port == 0 {
		postgresServer.Port = DefaultPostgresPort
	}
	if postgresServer.SSLMode == "" {
		postgresServer.SSLMode = DefaultPostgresSSLMode
	}

	if err := postgresServer.Validate(); err != nil {
		return nil, err
	}

	return &postgresServer, nil
}

// ResolvePassword reads the password from the space's secrets. It returns an empty string when the
// connection has no password, and an error when the named secret doesn't exist.
func (m *PostgresServer) ResolvePassword(secretsClient secrets.SecretsClient, spaceId string) (string, error) {
	if m.Password == "" {
		return "", nil
	}

	spaceSecrets, err := secretsClient.ReadKeyValue(context.Background(), fmt.Sprintf("spaces/%s", spaceId))
	if err != nil {
		return "", fmt.Errorf("failed to resolve secrets: %v", err)
	}
	if _, ok := spaceSecrets[m.Password]; !ok {
		return "", fmt.Errorf("the password secret %q does not exist in this space", m.Password)
	}

	return secretsClient.GetStringFromMap(spaceSecrets, m.Password), nil
}

func (m *PostgresServer) Category() ThingCategory {
	return PostgresServerThingCategory
}

func (m *PostgresServer) Validate() error {
	return validator.New().Struct(m)
}

func (m *PostgresServer) MarshalJson() ([]byte, error) {
	return json.Marshal(m)
}
