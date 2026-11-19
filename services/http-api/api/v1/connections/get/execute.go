package connectionsGet

import (
	"fmt"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	gruenthttp "github.com/ongruent/gruent/libs/http"
	"github.com/ongruent/gruent/services/http-api/services/sqlc"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
)

func execute(request *gruenthttp.Request[Input]) (*Output, error) {
	request.Span.AddEvent("execute")
	request.Span.SetAttributes(
		attribute.String("request.Input.ConnectionId", request.Input.ConnectionId),
		attribute.String("request.Input.SpaceId", request.Input.SpaceId),
	)

	dbCtx, dbSpan := otel.Tracer("sqlc").Start(request.Context, "Get connection")
	connection, err := sqlc.Queries.GetConnection(dbCtx, request.Input.ConnectionId)
	if err != nil {
		if err == pgx.ErrNoRows {
			err = fmt.Errorf("no connection found with ID %s", request.Input.ConnectionId)
			dbSpan.SetAttributes(
				attribute.String("error.type", "database"),
				attribute.String("error.message", err.Error()),
			)
			dbSpan.End()

			return nil, fiber.NewError(fiber.StatusBadRequest, err.Error())
		}

		dbSpan.SetAttributes(
			attribute.String("error.type", "database"),
			attribute.String("error.message", fmt.Sprintf("error getting connection from the database: %s", err)),
		)
		dbSpan.End()

		return nil, err
	}

	// if connection is internal, do not return it
	if connection.Internal {
		errMessage := "error getting connection from the database: connection is internal"
		dbSpan.SetAttributes(
			attribute.String("error.type", "database"),
			attribute.String("error.message", errMessage),
		)
		dbSpan.End()

		return nil, fiber.NewError(fiber.StatusBadRequest, errMessage)
	}

	dbSpan.End()

	output := Output{
		Connection: &connection,
	}

	return &output, nil
}
