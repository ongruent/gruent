package list

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Runs listExecutions against a real ClickHouse with the local platform's otel_traces and otel_logs schema
// (deploy/platform/local/config/clickhouse), seeded with telemetry shaped like a runtime worker's. Set
// CLICKHOUSE_TEST_ADDR (e.g. localhost:9003, with CLICKHOUSE_TEST_USERNAME/CLICKHOUSE_TEST_PASSWORD) to run it.
func TestListExecutions(t *testing.T) {
	conn := testClickhouse(t)
	ctx := context.Background()
	base := time.Date(2026, 11, 20, 12, 0, 0, 0, time.UTC)

	// Channel ch1 in space sp1: three executions, oldest first.
	insertExecution(t, conn, "sp1", "ch1", "trace-1", base, 1500*time.Millisecond, "completed", "info")
	insertExecution(t, conn, "sp1", "ch1", "trace-2", base.Add(time.Minute), 20*time.Millisecond, "failed", "error")
	insertExecution(t, conn, "sp1", "ch1", "trace-3", base.Add(2*time.Minute), 3*time.Millisecond, "completed", "info", "warn")
	// Same channel ID in another space, another channel of the space, and a non-channel service's span.
	insertExecution(t, conn, "sp2", "ch1", "other-space", base.Add(3*time.Minute), time.Millisecond, "completed", "info")
	insertExecution(t, conn, "sp1", "ch2", "other-channel", base.Add(3*time.Minute), time.Millisecond, "failed", "error")
	exec(t, conn, `INSERT INTO otel_traces (Timestamp, TraceId, SpanId, SpanName, ServiceName, ResourceAttributes, Duration)
		VALUES (?, 'api-trace', 'span', 'channel.execution', 'http-api', map('gruent.space.id', 'sp1', 'gruent.channel.id', 'ch1'), 1)`,
		base.Add(4*time.Minute))
	// A step span of an execution isn't an execution.
	exec(t, conn, `INSERT INTO otel_traces (Timestamp, TraceId, SpanId, ParentSpanId, SpanName, ServiceName, ResourceAttributes, Duration)
		VALUES (?, 'trace-1', 'step-span', 'trace-1-root', 'channel.step', 'runtime', ?, 1)`,
		base, channelResource("sp1", "ch1"))

	ids := func(items []ChannelExecutionListItem) []string {
		out := []string{}
		for _, item := range items {
			out = append(out, item.ExecutionId)
		}
		return out
	}

	t.Run("lists the channel's executions newest first", func(t *testing.T) {
		items, count, err := listExecutions(ctx, conn, Input{SpaceId: "sp1", ChannelId: "ch1", Page: 1, ResultsPerPage: 10})
		require.NoError(t, err)
		assert.Equal(t, int64(3), count)
		assert.Equal(t, []string{"trace-3", "trace-2", "trace-1"}, ids(items))

		oldest := items[2]
		assert.Equal(t, "ch1", oldest.ChannelId)
		assert.Equal(t, "Completed", oldest.Status)
		assert.True(t, base.Equal(oldest.StartTime), "start time %s", oldest.StartTime)
		assert.True(t, base.Add(1500*time.Millisecond).Equal(oldest.EndTime), "end time %s", oldest.EndTime)
		assert.Equal(t, int64(1500), oldest.DurationMs)
		assert.Equal(t, "trace-1", oldest.LogAttributes["gruent.execution.id"])
		assert.Equal(t, "Fatal Error", items[1].Status)
	})

	t.Run("pages", func(t *testing.T) {
		first, count, err := listExecutions(ctx, conn, Input{SpaceId: "sp1", ChannelId: "ch1", Page: 1, ResultsPerPage: 2})
		require.NoError(t, err)
		assert.Equal(t, int64(3), count)
		assert.Equal(t, []string{"trace-3", "trace-2"}, ids(first))

		second, _, err := listExecutions(ctx, conn, Input{SpaceId: "sp1", ChannelId: "ch1", Page: 2, ResultsPerPage: 2})
		require.NoError(t, err)
		assert.Equal(t, []string{"trace-1"}, ids(second))
	})

	t.Run("filters by log level", func(t *testing.T) {
		items, count, err := listExecutions(ctx, conn, Input{SpaceId: "sp1", ChannelId: "ch1", Page: 1, ResultsPerPage: 10, StatusFilter: "error"})
		require.NoError(t, err)
		assert.Equal(t, int64(1), count)
		assert.Equal(t, []string{"trace-2"}, ids(items))

		items, count, err = listExecutions(ctx, conn, Input{SpaceId: "sp1", ChannelId: "ch1", Page: 1, ResultsPerPage: 10, StatusFilter: "info"})
		require.NoError(t, err)
		assert.Equal(t, int64(2), count)
		assert.Equal(t, []string{"trace-3", "trace-1"}, ids(items))
	})

	t.Run("filters by execution status", func(t *testing.T) {
		items, count, err := listExecutions(ctx, conn, Input{SpaceId: "sp1", ChannelId: "ch1", Page: 1, ResultsPerPage: 10, StatusFilter: "failed"})
		require.NoError(t, err)
		assert.Equal(t, int64(1), count)
		assert.Equal(t, []string{"trace-2"}, ids(items))
	})

	t.Run("only lists executions of the requested space", func(t *testing.T) {
		items, count, err := listExecutions(ctx, conn, Input{SpaceId: "sp2", ChannelId: "ch1", Page: 1, ResultsPerPage: 10})
		require.NoError(t, err)
		assert.Equal(t, int64(1), count)
		assert.Equal(t, []string{"other-space"}, ids(items))

		items, count, err = listExecutions(ctx, conn, Input{SpaceId: "sp3", ChannelId: "ch1", Page: 1, ResultsPerPage: 10})
		require.NoError(t, err)
		assert.Equal(t, int64(0), count)
		assert.Empty(t, items)
	})
}

func testClickhouse(t *testing.T) clickhouse.Conn {
	t.Helper()
	addr := os.Getenv("CLICKHOUSE_TEST_ADDR")
	if addr == "" {
		t.Skip("CLICKHOUSE_TEST_ADDR not set")
	}
	auth := clickhouse.Auth{Username: os.Getenv("CLICKHOUSE_TEST_USERNAME"), Password: os.Getenv("CLICKHOUSE_TEST_PASSWORD")}
	admin, err := clickhouse.Open(&clickhouse.Options{Addr: []string{addr}, Auth: auth})
	require.NoError(t, err)
	t.Cleanup(func() { _ = admin.Close() })

	database := fmt.Sprintf("executions_list_test_%d", time.Now().UnixNano())
	exec(t, admin, "CREATE DATABASE "+database)
	t.Cleanup(func() { _ = admin.Exec(context.Background(), "DROP DATABASE IF EXISTS "+database) })

	_, file, _, _ := runtime.Caller(0)
	schemaPath := filepath.Join(filepath.Dir(file), "../../../../../../../deploy/platform/local/config/clickhouse/init/docker-entrypoint-initdb.d/default.sql")
	schema, err := os.ReadFile(schemaPath)
	require.NoError(t, err)
	for _, table := range []string{"otel_traces", "otel_logs"} {
		prefix := "CREATE TABLE IF NOT EXISTS default." + table + " "
		var statement string
		for _, line := range strings.Split(string(schema), "\n") {
			if strings.HasPrefix(line, prefix) {
				statement = strings.TrimSuffix(strings.TrimSpace(line), ";")
			}
		}
		require.NotEmpty(t, statement, "schema of %s", table)
		exec(t, admin, strings.Replace(statement, "default."+table, database+"."+table, 1))
	}

	auth.Database = database
	conn, err := clickhouse.Open(&clickhouse.Options{Addr: []string{addr}, Auth: auth})
	require.NoError(t, err)
	t.Cleanup(func() { _ = conn.Close() })
	return conn
}

func exec(t *testing.T, conn clickhouse.Conn, query string, args ...any) {
	t.Helper()
	require.NoError(t, conn.Exec(context.Background(), query, args...))
}

func channelResource(spaceId, channelId string) map[string]string {
	return map[string]string{
		"service.name":      "runtime",
		"gruent.workload":   "channel",
		"gruent.org.id":     "org1",
		"gruent.space.id":   spaceId,
		"gruent.channel.id": channelId,
	}
}

// insertExecution inserts an execution's root span and one log entry per level, as a runtime worker exports them.
func insertExecution(t *testing.T, conn clickhouse.Conn, spaceId, channelId, traceId string, start time.Time, duration time.Duration, status string, levels ...string) {
	t.Helper()
	resource := channelResource(spaceId, channelId)
	exec(t, conn, `INSERT INTO otel_traces (Timestamp, TraceId, SpanId, SpanName, SpanKind, ServiceName, ResourceAttributes, SpanAttributes, Duration, StatusCode)
		VALUES (?, ?, ?, 'channel.execution', 'Consumer', 'runtime', ?, ?, ?, 'Ok')`,
		start, traceId, traceId+"-root", resource,
		map[string]string{"gruent.execution.id": traceId, "gruent.execution.status": status, "gruent.trigger": "timer"},
		uint64(duration.Nanoseconds()))
	for _, level := range levels {
		exec(t, conn, `INSERT INTO otel_logs (Timestamp, TraceId, SpanId, SeverityText, ServiceName, Body, ResourceAttributes, LogAttributes)
			VALUES (?, ?, ?, ?, 'runtime', 'entry', ?, ?)`,
			start, traceId, traceId+"-root", level, resource, map[string]string{"gruent.execution.id": traceId})
	}
}
