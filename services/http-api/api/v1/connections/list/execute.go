package connectionsList

import (
	"fmt"

	sqldb "github.com/ongruent/gruent/db/sqlc"
	gruenthttp "github.com/ongruent/gruent/libs/http"
	"github.com/ongruent/gruent/services/http-api/services/sqlc"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
)

func execute(request *gruenthttp.Request[Input]) (*Output, error) {
	request.Span.AddEvent("execute")
	request.Span.SetAttributes(
		attribute.Int("request.Input.Page", request.Input.Page),
		attribute.Int("request.Input.ResultsPerPage", request.Input.ResultsPerPage),
		attribute.String("request.Input.SpaceId", request.Input.SpaceId),
		attribute.String("request.Input.Filter", request.Input.Filter),
		attribute.String("request.Input.TagFilter", fmt.Sprintf("%#v", request.Input.TagFilter)),
	)
	if request.Input.ConnectionCategory != nil {
		request.Span.SetAttributes(
			attribute.String("request.Input.ConnectionCategory", string(*request.Input.ConnectionCategory)),
		)
	}

	// Get the count of connections (based on the filter)
	dbCtx, dbSpan := otel.Tracer("sqlc").Start(request.Context, "Count connections")
	connectionCategory := ""
	if request.Input.ConnectionCategory != nil {
		connectionCategory = request.Input.ConnectionCategory.String()
	}
	filter := ""
	if request.Input.Filter != "" {
		filter = "%" + request.Input.Filter + "%"
	}
	var tagFilter []string
	if len(request.Input.TagFilter) > 0 {
		tagFilter = request.Input.TagFilter
	}

	connectionsCount, err := sqlc.Queries.CountConnectionsFiltered(dbCtx, request.Input.SpaceId, connectionCategory, filter, tagFilter)
	if err != nil {
		dbSpan.SetAttributes(
			attribute.String("error.type", "database"),
			attribute.String("error.message", fmt.Sprintf("error counting connections in space in the database: %s", err)),
		)
		dbSpan.End()

		return nil, err
	}

	dbSpan.SetAttributes(
		attribute.Int64("connections_count", connectionsCount),
	)
	dbSpan.End()

	// List the connections (based on the filter)
	dbCtx, dbSpan = otel.Tracer("sqlc").Start(request.Context, "List connections")
	connections, err := sqlc.Queries.ListConnectionsFiltered(dbCtx, sqldb.ListConnectionsFilteredParams{
		SpaceID: request.Input.SpaceId,
		Column2: connectionCategory,
		Column3: filter,
		Column4: tagFilter,
		Limit:   int32(request.Input.ResultsPerPage),
		Offset:  int32((request.Input.Page - 1) * request.Input.ResultsPerPage),
	})
	if err != nil {
		dbSpan.SetAttributes(
			attribute.String("error.type", "database"),
			attribute.String("error.message", fmt.Sprintf("error listing connections in the database: %s", err)),
		)
		dbSpan.End()

		return nil, err
	}

	dbSpan.End()

	output := Output{
		Connections:    connections,
		Page:           request.Input.Page,
		TotalPages:     (int(connectionsCount) + request.Input.ResultsPerPage - 1) / request.Input.ResultsPerPage,
		TotalResults:   int(connectionsCount),
		ResultsPerPage: request.Input.ResultsPerPage,
	}

	return &output, nil
}
