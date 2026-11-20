package list

import (
	"fmt"
	"time"

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

	// Channel executions share the platform's trace pipeline. Each execution is one root span
	// (channel.execution) of a runtime worker, which tags its telemetry with the channel's identity.
	const executionsFilter = `
		FROM otel_traces
		WHERE SpanName = 'channel.execution'
			AND ResourceAttributes['gruent.workload'] = 'channel'
			AND ResourceAttributes['gruent.channel.id'] = ?
			AND ResourceAttributes['gruent.space.id'] = ?
			AND (? = '' OR SpanAttributes['gruent.execution.status'] = ?)`
	filterArgs := []any{request.Input.ChannelId, request.Input.SpaceId, request.Input.StatusFilter, request.Input.StatusFilter}

	// Query for channel executions count
	dbCtx, dbSpan := otel.Tracer("clickhouse").Start(request.Context, "Count channel executions")
	var channelExecutionsCount int64
	err := clickhouseService.Conn.QueryRow(dbCtx, "SELECT toInt64(count(*)) "+executionsFilter, filterArgs...).Scan(&channelExecutionsCount)
	if err != nil {
		dbSpan.SetStatus(codes.Error, "Failed to count channel executions")
		dbSpan.SetAttributes(
			attribute.String("error.type", "database"),
			attribute.String("error.message", err.Error()),
		)
		dbSpan.End()
		return nil, err
	}
	dbSpan.SetStatus(codes.Ok, "Successfully counted channel executions")
	dbSpan.SetAttributes(attribute.String("db.result.count", fmt.Sprintf("%d", channelExecutionsCount)))
	dbSpan.End()

	// List channel executions
	dbCtx, dbSpan = otel.Tracer("clickhouse").Start(request.Context, "List channel executions")

	channelExecutionsList := []ChannelExecutionListItem{}
	query := `
		SELECT
			TraceId AS executionId,
			Timestamp AS startTime,
			Timestamp + toIntervalNanosecond(Duration) AS endTime,
			toInt64(intDiv(Duration, 1000000)) AS durationMs,
			ResourceAttributes['gruent.channel.id'] AS channelId,
			SpanAttributes AS logAttributes,
			` + executionStatusSQL + ` AS status
		` + executionsFilter + `
		ORDER BY startTime DESC
		LIMIT ? OFFSET ?`
	args := append(filterArgs, request.Input.ResultsPerPage, (request.Input.Page-1)*request.Input.ResultsPerPage)
	err = clickhouseService.Conn.Select(dbCtx, &channelExecutionsList, query, args...)
	if err != nil {
		dbSpan.SetAttributes(attribute.String("error", fmt.Sprintf("error executing ClickHouse query: %s", err)))
		dbSpan.End()
		return nil, err
	}

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

// executionStatusSQL maps the runtime's gruent.execution.status attribute to the statuses the hub shows.
const executionStatusSQL = `CASE SpanAttributes['gruent.execution.status']
				WHEN 'completed' THEN 'Completed'
				WHEN 'timeout' THEN 'Timeout'
				WHEN 'failed' THEN 'Fatal Error'
				WHEN 'cancelled' THEN 'Cancelled'
				ELSE 'Unknown'
			END`
