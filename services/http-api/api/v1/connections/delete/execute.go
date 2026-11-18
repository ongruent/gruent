package connectionsDelete

import (
	"encoding/json"
	"fmt"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	gruenthttp "github.com/ongruent/gruent/libs/http"
	gruentchannels "github.com/ongruent/gruent/libs/legacy/engine/channels"
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

	// Check if connection is used in any channel
	dbCtx, dbSpan := otel.Tracer("sqlc").Start(request.Context, "Check if connection is used in channel")
	channels, err := sqlc.Queries.ListChannels(dbCtx, request.Input.SpaceId)
	if err != nil {
		dbSpan.SetAttributes(
			attribute.String("error.type", "database"),
			attribute.String("error.message", fmt.Sprintf("error checking if connection is used in a channel: %s", err)),
		)
		dbSpan.End()

		return nil, err
	}

	dbSpan.End()

	channelsWithConnection := []string{}
	for _, channel := range channels {
		var channelConfig gruentchannels.Channel
		err = json.Unmarshal(channel.Config, &channelConfig)
		if err != nil {
			request.Span.SetAttributes(
				attribute.String("error.type", "parse_json"),
				attribute.String("error.message", fmt.Sprintf("could not read channel config: %s", err.Error())),
			)

			errorResponse := gruenthttp.NewErrorResponse([]any{
				fmt.Sprintf("could not read channel config: %s", err.Error()),
			})
			errorResponseJson, _ := errorResponse.MarshalJson()
			return nil, fiber.NewError(fiber.StatusBadRequest, string(errorResponseJson))
		}

		for _, step := range channelConfig.Nodes {
			for _, connectionDependency := range step.Metadata.Dependencies.Things {

				if connectionDependency.ThingId == request.Input.ConnectionId {
					channelsWithConnection = append(channelsWithConnection, channel.ID)
				}
			}
		}
	}

	if len(channelsWithConnection) > 0 {
		errMessage := fmt.Sprintf("connection is used in %d channel(s)", len(channelsWithConnection))
		request.Span.SetAttributes(
			attribute.String("error.type", "context_validation"),
			attribute.String("error.message", errMessage),
		)

		errorResponse := gruenthttp.NewErrorResponse([]any{
			errMessage,
		})
		errorResponseJson, _ := errorResponse.MarshalJson()
		return nil, fiber.NewError(fiber.StatusConflict, string(errorResponseJson))
	}

	// Check if connection is referenced in any other connections
	dbCtx, dbSpan = otel.Tracer("sqlc").Start(request.Context, "Check if connection is referenced in another connection")
	connections, err := sqlc.Queries.ListConnections(dbCtx, request.Input.SpaceId)
	if err != nil {
		dbSpan.SetAttributes(
			attribute.String("error.type", "database"),
			attribute.String("error.message", fmt.Sprintf("error checking if connection is used in another connection: %s", err)),
		)
		dbSpan.End()

		return nil, err
	}

	dbSpan.End()

	connectionsWithConnection := []string{}
	for _, connection := range connections {
		var connectionAttributes map[string]any
		err = json.Unmarshal(connection.Attributes, &connectionAttributes)
		if err != nil {
			request.Span.SetAttributes(
				attribute.String("error.type", "parse_json"),
				attribute.String("error.message", fmt.Sprintf("could not read connection attributes: %s", err.Error())),
			)

			errorResponse := gruenthttp.NewErrorResponse([]any{
				fmt.Sprintf("could not read connection attributes: %s", err.Error()),
			})
			errorResponseJson, _ := errorResponse.MarshalJson()
			return nil, fiber.NewError(fiber.StatusBadRequest, string(errorResponseJson))
		}

		for _, value := range connectionAttributes {
			if value == request.Input.ConnectionId {
				connectionsWithConnection = append(connectionsWithConnection, connection.ID)
			}
		}
	}

	if len(connectionsWithConnection) > 0 {
		errMessage := fmt.Sprintf("connection is referenced in %d other connection(s)", len(connectionsWithConnection))
		request.Span.SetAttributes(
			attribute.String("error.type", "context_validation"),
			attribute.String("error.message", errMessage),
		)

		errorResponse := gruenthttp.NewErrorResponse([]any{
			errMessage,
		})
		errorResponseJson, _ := errorResponse.MarshalJson()
		return nil, fiber.NewError(fiber.StatusConflict, string(errorResponseJson))
	}

	// Delete connection
	dbCtx, dbSpan = otel.Tracer("sqlc").Start(request.Context, "Delete connection")
	_, err = sqlc.Queries.GetConnection(dbCtx, request.Input.ConnectionId)
	if err != nil {
		if err == pgx.ErrNoRows {
			dbSpan.SetAttributes(
				attribute.String("error.type", "database"),
				attribute.String("error.message", fmt.Sprintf("no connection found with ID %s", request.Input.ConnectionId)),
			)
			dbSpan.End()

			return nil, fiber.NewError(fiber.StatusBadRequest)
		}

		dbSpan.SetAttributes(
			attribute.String("error.type", "database"),
			attribute.String("error.message", fmt.Sprintf("error deleting connection from the database: %s", err)),
		)
		dbSpan.End()

		return nil, err
	}

	err = sqlc.Queries.DeleteConnection(dbCtx, request.Input.ConnectionId)
	if err != nil {
		dbSpan.SetAttributes(
			attribute.String("error.type", "database"),
			attribute.String("error.message", fmt.Sprintf("error deleting connection from the database: %s", err)),
		)
		dbSpan.End()

		return nil, err
	}

	dbSpan.End()

	return nil, nil
}
