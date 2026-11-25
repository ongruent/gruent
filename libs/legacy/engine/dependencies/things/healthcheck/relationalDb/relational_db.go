package relationalDbHealthcheck

import (
	"context"
	"fmt"
	"net"
	"net/url"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/ongruent/gruent/libs/legacy/engine/dependencies/things"
)

// PostgresConnectionString builds the connection URL for a PostgreSQL connection, with the password
// already resolved from the space's secrets.
func PostgresConnectionString(attrs *things.PostgresServer, password string) string {
	connectionUrl := url.URL{
		Scheme: "postgres",
		Host:   net.JoinHostPort(attrs.Host, strconv.Itoa(attrs.Port)),
		Path:   "/" + attrs.Database,
	}
	if password != "" {
		connectionUrl.User = url.UserPassword(attrs.Username, password)
	} else {
		connectionUrl.User = url.User(attrs.Username)
	}
	query := url.Values{}
	query.Set("sslmode", attrs.SSLMode)
	query.Set("connect_timeout", "3")
	connectionUrl.RawQuery = query.Encode()
	return connectionUrl.String()
}

// PostgresServer connects to the database with the connection's credentials and pings it.
func PostgresServer(attrs *things.PostgresServer, password string) error {
	config, err := pgx.ParseConfig(PostgresConnectionString(attrs, password))
	if err != nil {
		return fmt.Errorf("invalid PostgreSQL connection settings: %s", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	conn, err := pgx.ConnectConfig(ctx, config)
	if err != nil {
		return fmt.Errorf("failed to connect to the PostgreSQL server at %s:%d: %s", attrs.Host, attrs.Port, err)
	}
	defer conn.Close(context.Background())

	if err := conn.Ping(ctx); err != nil {
		return fmt.Errorf("failed to ping the PostgreSQL server at %s:%d: %s", attrs.Host, attrs.Port, err)
	}

	return nil
}
