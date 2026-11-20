package list

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"
	gruenthttp "github.com/ongruent/gruent/libs/http"
	clickhouseService "github.com/ongruent/gruent/services/http-api/services/clickhouse"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
)

type ChannelExecutionListItem struct {
	ExecutionId   string            `ch:"executionId" json:"executionId"`
	StartTime     time.Time         `ch:"startTime" json:"startTime"`
	EndTime       time.Time         `ch:"endTime" json:"endTime"`
	DurationMs    int64             `ch:"durationMs" json:"durationMs"`
	ChannelId     string            `ch:"channelId" json:"channelId"`
	LogAttributes map[string]string `ch:"logAttributes" json:"logAttributes"`
	Status        string            `ch:"status" json:"status"`
}

func execute(request *gruenthttp.Request[Input]) (*Output, error) {
	request.Span.AddEvent("execute")
	request.Span.SetAttributes(
		attribute.String("request.Input.ChannelId", request.Input.ChannelId),
		attribute.String("request.Input.SpaceId", request.Input.SpaceId),
		attribute.Int("request.Input.Page", request.Input.Page),
		attribute.Int("request.Input.ResultsPerPage", request.Input.ResultsPerPage),
		attribute.String("request.Input.StatusFilter", request.Input.StatusFilter),
	)

	dbCtx, dbSpan := otel.Tracer("clickhouse").Start(request.Context, "List channel executions")
	channelExecutionsList, channelExecutionsCount, err := listExecutions(dbCtx, clickhouseService.Conn, request.Input)
	if err != nil {
		dbSpan.SetStatus(codes.Error, "Failed to list channel executions")
		dbSpan.SetAttributes(
			attribute.String("error.type", "database"),
			attribute.String("error.message", err.Error()),
		)
		dbSpan.End()
		return nil, err
	}
	dbSpan.SetStatus(codes.Ok, "Successfully listed channel executions")
	dbSpan.SetAttributes(attribute.String("db.result.count", fmt.Sprintf("%d", channelExecutionsCount)))
	dbSpan.End()

	output := Output{
		ChannelExecutionsList: channelExecutionsList,
		Page:                  request.Input.Page,
		TotalPages:            (int(channelExecutionsCount) + request.Input.ResultsPerPage - 1) / request.Input.ResultsPerPage,
		TotalResults:          int(channelExecutionsCount),
		ResultsPerPage:        request.Input.ResultsPerPage,
	}

	return &output, nil
}

// logLevels are the levels of execution log entries. The hub filters executions by them ("tags"): a level
// filter lists the executions with at least one log entry at that level.
var logLevels = map[string]bool{"debug": true, "info": true, "warn": true, "error": true}

// listExecutions returns a page of the channel's executions, newest first, and the total number of them.
//
// Channel executions share the platform's trace pipeline. Each execution is one root span
// (channel.execution) of a runtime worker, whose resource attributes carry the channel's identity, and its
// trace ID is the execution ID. Its log entries are in otel_logs under the same trace ID.
//
// The status filter is either a log level (see logLevels) or an execution status (gruent.execution.status:
// completed, failed, timeout, cancelled).
func listExecutions(ctx context.Context, conn clickhouse.Conn, input Input) ([]ChannelExecutionListItem, int64, error) {
	conditions := []string{
		"SpanName = 'channel.execution'",
		"ResourceAttributes['gruent.workload'] = 'channel'",
		"ResourceAttributes['gruent.space.id'] = ?",
		"ResourceAttributes['gruent.channel.id'] = ?",
	}
	args := []any{input.SpaceId, input.ChannelId}

	statusFilter := strings.ToLower(strings.TrimSpace(input.StatusFilter))
	switch {
	case statusFilter == "":
	case logLevels[statusFilter]:
		conditions = append(conditions, `TraceId IN (
			SELECT TraceId
			FROM otel_logs
			WHERE ResourceAttributes['gruent.workload'] = 'channel'
				AND ResourceAttributes['gruent.space.id'] = ?
				AND ResourceAttributes['gruent.channel.id'] = ?
				AND lower(SeverityText) = ?)`)
		args = append(args, input.SpaceId, input.ChannelId, statusFilter)
	default:
		conditions = append(conditions, "SpanAttributes['gruent.execution.status'] = ?")
		args = append(args, statusFilter)
	}
	filter := "FROM otel_traces WHERE " + strings.Join(conditions, " AND ")

	var count uint64
	if err := conn.QueryRow(ctx, "SELECT count() "+filter, args...).Scan(&count); err != nil {
		return nil, 0, fmt.Errorf("error counting channel executions: %w", err)
	}

	executions := []ChannelExecutionListItem{}
	query := `
		SELECT
			TraceId AS executionId,
			Timestamp AS startTime,
			Timestamp + toIntervalNanosecond(Duration) AS endTime,
			toInt64(intDiv(Duration, 1000000)) AS durationMs,
			ResourceAttributes['gruent.channel.id'] AS channelId,
			SpanAttributes AS logAttributes,
			` + executionStatusSQL + ` AS status
		` + filter + `
		ORDER BY Timestamp DESC, TraceId DESC
		LIMIT ? OFFSET ?`
	pageArgs := append(append([]any{}, args...), input.ResultsPerPage, (input.Page-1)*input.ResultsPerPage)
	if err := conn.Select(ctx, &executions, query, pageArgs...); err != nil {
		return nil, 0, fmt.Errorf("error listing channel executions: %w", err)
	}

	return executions, int64(count), nil
}

// executionStatusSQL maps the runtime's gruent.execution.status attribute to the statuses the hub shows.
const executionStatusSQL = `CASE SpanAttributes['gruent.execution.status']
				WHEN 'completed' THEN 'Completed'
				WHEN 'timeout' THEN 'Timeout'
				WHEN 'failed' THEN 'Fatal Error'
				WHEN 'cancelled' THEN 'Cancelled'
				ELSE 'Unknown'
			END`
