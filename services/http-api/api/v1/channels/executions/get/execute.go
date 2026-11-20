package get

import (
	"fmt"
	"time"

	"github.com/gofiber/fiber/v2"
	gruenthttp "github.com/ongruent/gruent/libs/http"
	clickhouseService "github.com/ongruent/gruent/services/http-api/services/clickhouse"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
)

type StepExecutionLog struct {
	TraceId            string            `ch:"traceId" json:"traceId"`
	SpanId             string            `ch:"spanId" json:"spanId"`
	Timestamp          time.Time         `ch:"timestamp" json:"timestamp"`
	Level              string            `ch:"level" json:"level"`
	Body               string            `ch:"body" json:"body"`
	LogAttributes      map[string]string `ch:"logAttributes" json:"logAttributes"`
	ResourceAttributes map[string]string `ch:"resourceAttributes" json:"resourceAttributes"`
	Status             string            `ch:"status" json:"status"`
}

type ChannelExecution struct {
	TraceId           string             `ch:"executionId" json:"executionId"`
	StartTime         time.Time          `ch:"startTime" json:"startTime"`
	EndTime           time.Time          `ch:"endTime" json:"endTime"`
	DurationMs        int64              `ch:"durationMs" json:"durationMs"`
	ChannelId         string             `ch:"channelId" json:"channelId"`
	Status            string             `ch:"status" json:"status"`
	StepExecutionLogs []StepExecutionLog `ch:"stepExecutionLogs" json:"stepExecutionLogs"`
}

func execute(request *gruenthttp.Request[Input]) (*Output, error) {
	request.Span.AddEvent("execute")
	request.Span.SetAttributes(
		attribute.String("request.Input.ChannelExecutionId", request.Input.ChannelExecutionId),
		attribute.String("request.Input.SpaceId", request.Input.SpaceId),
	)

	// Get step execution logs in a channel execution
	dbCtx, dbSpan := otel.Tracer("clickhouse").Start(request.Context, "List step execution logs")

	stepExecutionLogs := []StepExecutionLog{}

	// Logs of an execution share its trace ID. Only channel execution telemetry of the requested space
	// is returned.
	query := `
	SELECT
		TraceId as traceId,
		SpanId as spanId,
		Timestamp as timestamp,
		lower(SeverityText) as level,
		Body as body,
		LogAttributes as logAttributes,
		ResourceAttributes as resourceAttributes,
		CASE LogAttributes['gruent.execution.status']
			WHEN 'completed' THEN 'Completed'
			WHEN 'timeout' THEN 'Timeout'
			WHEN 'failed' THEN 'Fatal Error'
			WHEN 'cancelled' THEN 'Cancelled'
			ELSE 'Unknown'
		END as status
	FROM otel_logs
	WHERE TraceId = ?
		AND ResourceAttributes['gruent.workload'] = 'channel'
		AND ResourceAttributes['gruent.space.id'] = ?
	ORDER BY Timestamp ASC
	`

	err := clickhouseService.Conn.Select(dbCtx, &stepExecutionLogs, query, request.Input.ChannelExecutionId, request.Input.SpaceId)
	if err != nil {
		dbSpan.SetAttributes(
			attribute.String("error.type", "database"),
			attribute.String("error.message", fmt.Sprintf("error executing ClickHouse query: %s", err)),
		)
		dbSpan.End()
		return nil, err
	}

	dbSpan.End()

	if len(stepExecutionLogs) == 0 {
		response := gruenthttp.NewErrorResponse([]any{"Channel execution not found"})
		responseJson, _ := response.MarshalJson()
		return nil, fiber.NewError(fiber.StatusNotFound, string(responseJson))
	}

	// The hub shows the step of each entry from the "node" attribute.
	for i := range stepExecutionLogs {
		if stepExecutionLogs[i].LogAttributes == nil {
			stepExecutionLogs[i].LogAttributes = map[string]string{}
		}
		attributes := stepExecutionLogs[i].LogAttributes
		attributes["node"] = attributes["gruent.step.name"]
		if attributes["node"] == "" {
			attributes["node"] = "Channel"
		}
		attributes["level"] = stepExecutionLogs[i].Level
		attributes["execution_id"] = stepExecutionLogs[i].TraceId
	}

	// Group logs into a channel execution
	first, last := stepExecutionLogs[0], stepExecutionLogs[len(stepExecutionLogs)-1]
	channelStatus := "Unknown"
	for _, log := range stepExecutionLogs {
		if log.Status != "Unknown" {
			channelStatus = log.Status
		}
	}
	channelExecution := &ChannelExecution{
		TraceId:           request.Input.ChannelExecutionId,
		ChannelId:         first.ResourceAttributes["gruent.channel.id"],
		StartTime:         first.Timestamp,
		EndTime:           last.Timestamp,
		DurationMs:        last.Timestamp.Sub(first.Timestamp).Milliseconds(),
		Status:            channelStatus,
		StepExecutionLogs: stepExecutionLogs,
	}

	output := Output{
		ChannelExecution: channelExecution,
	}

	return &output, nil
}
