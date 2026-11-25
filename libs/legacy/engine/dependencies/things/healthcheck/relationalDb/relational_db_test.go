package relationalDbHealthcheck_test

import (
	"os"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/ongruent/gruent/libs/legacy/engine/dependencies/things"
	relationalDbHealthcheck "github.com/ongruent/gruent/libs/legacy/engine/dependencies/things/healthcheck/relationalDb"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestPostgresConnectionStringEscapesCredentials(t *testing.T) {
	attrs := &things.PostgresServer{Host: "db.internal", Port: 6543, Database: "iot", Username: "gru ent", SSLMode: "require"}

	config, err := pgx.ParseConfig(relationalDbHealthcheck.PostgresConnectionString(attrs, "p@ss:/word?"))
	require.NoError(t, err)
	assert.Equal(t, "db.internal", config.Host)
	assert.Equal(t, uint16(6543), config.Port)
	assert.Equal(t, "iot", config.Database)
	assert.Equal(t, "gru ent", config.User)
	assert.Equal(t, "p@ss:/word?", config.Password)
	assert.NotNil(t, config.TLSConfig, "sslmode=require uses TLS")

	ipv6 := &things.PostgresServer{Host: "::1", Port: 5432, Database: "iot", Username: "gruent", SSLMode: "disable"}
	config, err = pgx.ParseConfig(relationalDbHealthcheck.PostgresConnectionString(ipv6, ""))
	require.NoError(t, err)
	assert.Equal(t, "::1", config.Host)
	assert.Empty(t, config.Password)
	assert.Nil(t, config.TLSConfig)
}

func TestPostgresServerFailsWhenUnreachable(t *testing.T) {
	attrs := &things.PostgresServer{Host: "127.0.0.1", Port: 1, Database: "iot", Username: "gruent", SSLMode: "disable"}
	assert.ErrorContains(t, relationalDbHealthcheck.PostgresServer(attrs, ""), "failed to connect to the PostgreSQL server at 127.0.0.1:1")
}

// Runs against a real server when POSTGRES_TEST_URL is set, e.g. postgres://gruent:gruent@localhost:5432/gruent.
func TestPostgresServerAgainstRealServer(t *testing.T) {
	url := os.Getenv("POSTGRES_TEST_URL")
	if url == "" {
		t.Skip("POSTGRES_TEST_URL is not set")
	}
	config, err := pgx.ParseConfig(url)
	require.NoError(t, err)

	attrs := &things.PostgresServer{Host: config.Host, Port: int(config.Port), Database: config.Database, Username: config.User, SSLMode: "disable"}
	require.NoError(t, relationalDbHealthcheck.PostgresServer(attrs, config.Password))
	assert.Error(t, relationalDbHealthcheck.PostgresServer(attrs, config.Password+"-wrong"))
}
