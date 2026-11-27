package connectionsUpdate

import (
	"encoding/json"
	"fmt"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	gruenthttp "github.com/ongruent/gruent/libs/http"
	gruentchannels "github.com/ongruent/gruent/libs/legacy/engine/channels"
	"github.com/ongruent/gruent/libs/legacy/engine/dependencies/things"
	"github.com/ongruent/gruent/services/http-api/config"
	"github.com/ongruent/gruent/services/http-api/services/sqlc"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
)

func execute(request *gruenthttp.Request[Input]) (*Output, error) {
	request.Span.AddEvent("execute")
	request.Span.SetAttributes(
		attribute.String("request.Input.Name", request.Input.Name),
		attribute.String("request.Input.ConnectionId", request.Input.ConnectionId),
		attribute.String("request.Input.SpaceId", request.Input.SpaceId),
		attribute.String("request.Input.Attributes", fmt.Sprintf("%#v", request.Input.Attributes)),
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
		// Check if channel is published
		if !channel.PublishedAt.Valid {
			continue
		}

		// Unmarshal channel config
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

		// Check if the connection is used in the channel config
		for _, step := range channelConfig.Nodes {
			for _, connectionDependency := range step.Metadata.Dependencies.Things {

				if connectionDependency.ThingId == request.Input.ConnectionId {
					channelsWithConnection = append(channelsWithConnection, channel.ID)
				}
			}
		}
	}

	if len(channelsWithConnection) > 0 {
		request.Span.SetAttributes(
			attribute.String("error.type", "context_validation"),
			attribute.String("error.message", fmt.Sprintf("connection is used in %d channel(s)", len(channelsWithConnection))),
		)

		errorResponse := gruenthttp.NewErrorResponse([]any{
			fmt.Sprintf("connection is used in %d channel(s)", len(channelsWithConnection)),
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
		request.Span.SetAttributes(
			attribute.String("error.type", "context_validation"),
			attribute.String("error.message", fmt.Sprintf("connection is referenced in %d other connection(s)", len(connectionsWithConnection))),
		)

		errorResponse := gruenthttp.NewErrorResponse([]any{
			fmt.Sprintf("connection is referenced in %d other connection(s)", len(connectionsWithConnection)),
		})
		errorResponseJson, _ := errorResponse.MarshalJson()
		return nil, fiber.NewError(fiber.StatusConflict, string(errorResponseJson))
	}

	attributes, err := json.Marshal(request.Input.Attributes)
	if err != nil {
		errMessage := fmt.Sprintf("error saving attributes: %s", err)
		request.Span.SetAttributes(
			attribute.String("error.type", "parse_json"),
			attribute.String("error.message", errMessage),
		)

		response := gruenthttp.NewErrorResponse([]any{errMessage})
		responseJson, _ := response.MarshalJson()
		return nil, fiber.NewError(400, string(responseJson))
	}

	dbCtx, dbSpan = otel.Tracer("sqlc").Start(request.Context, "Update connection in space")
	existingConnection, err := sqlc.Queries.GetConnection(dbCtx, request.Input.ConnectionId)
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
			attribute.String("error.message", fmt.Sprintf("error loading connection from the database: %s", err)),
		)
		dbSpan.End()

		return nil, err
	}

	// PostgreSQL connections keep the password as a secret name and are read by the runtime, so validate
	// them like on create and store the normalized attributes.
	if existingConnection.ConnectionCategory == things.PostgresServerThingCategory.String() {
		attributes, err = validatePostgresServer(request)
		if err != nil {
			dbSpan.End()
			return nil, err
		}
	}

	connection, err := sqlc.Queries.UpdateConnection(dbCtx, request.Input.ConnectionId, request.Input.Name, attributes, request.GetActorId())
	if err != nil {
		dbSpan.SetAttributes(
			attribute.String("error.type", "database"),
			attribute.String("error.message", fmt.Sprintf("error updating connection in the database: %s", err)),
		)
		dbSpan.End()

		return nil, err
	}
	dbSpan.End()

	output := Output{
		Connection: &connection,
	}

	return &output, nil
}

func validatePostgresServer(request *gruenthttp.Request[Input]) ([]byte, error) {
	postgresServer, err := things.NewPostgresServerForSpace(request.Input.Attributes, config.SecretsClient, request.Input.SpaceId)
	if err != nil {
		request.Span.SetAttributes(
			attribute.String("error.type", "validation"),
			attribute.String("error.message", err.Error()),
		)
		response := gruenthttp.NewErrorResponse([]any{err.Error()})
		responseJson, _ := response.MarshalJson()
		return nil, fiber.NewError(fiber.StatusBadRequest, string(responseJson))
	}

	return postgresServer.MarshalJson()
}
