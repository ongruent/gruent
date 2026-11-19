package channelsCreate

import (
	"encoding/json"
	"fmt"

	sqldb "github.com/ongruent/gruent/db/sqlc"
	gruenthttp "github.com/ongruent/gruent/libs/http"
	"github.com/ongruent/gruent/libs/id"
	"github.com/ongruent/gruent/libs/legacy/engine/dependencies/things"
	"github.com/ongruent/gruent/services/http-api/services/sqlc"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
)

func execute(request *gruenthttp.Request[Input]) (*Output, error) {
	request.Span.AddEvent("execute")
	request.Span.SetAttributes(
		attribute.String("request.Input.Name", request.Input.Name),
		attribute.String("request.Input.SpaceId", request.Input.SpaceId),
	)

	// Create channel entry
	dbCtx, dbSpan := otel.Tracer("sqlc").Start(request.Context, "Insert channel")
	channelId, err := id.Generator.NewChannelId()
	if err != nil {
		request.Span.SetAttributes(
			attribute.String("error.type", "id_generation"),
			attribute.String("error.message", fmt.Sprintf("error generating a new Channel ID: %s", err)),
		)
		return nil, err
	}

	if request.Input.Config == nil {
		request.Input.Config = make(map[string]any)
	}
	request.Input.Config["id"] = channelId
	jsonConfig, _ := json.Marshal(request.Input.Config)

	channel, err := sqlc.Queries.CreateChannel(dbCtx, sqldb.CreateChannelParams{
		ID:        *channelId,
		Name:      request.Input.Name,
		SpaceID:   request.Input.SpaceId,
		Config:    jsonConfig,
		CreatedBy: request.GetActorId(),
		UpdatedBy: request.GetActorId(),
	})
	if err != nil {
		dbSpan.SetAttributes(
			attribute.String("error.type", "database"),
			attribute.String("error.message", fmt.Sprintf("error inserting channel into the database: %s", err)),
		)
		dbSpan.End()
		return nil, err
	}

	dbSpan.End()

	// Create draft internal HTTP server connection
	dbCtx, dbSpan = otel.Tracer("sqlc").Start(request.Context, "Insert internal HTTP server connection")

	// Set the connection ID to the same ID than the channel
	connectionId := channelId
	_, err = sqlc.Queries.CreateConnection(dbCtx, sqldb.CreateConnectionParams{
		ID:                 *connectionId,
		Name:               request.Input.Name,
		SpaceID:            request.Input.SpaceId,
		Attributes:         []byte("{}"),
		Internal:           true,
		ConnectionCategory: things.HttpServerThingCategory.String(),
		CreatedBy:          "internal",
		UpdatedBy:          "internal",
	})
	if err != nil {
		dbSpan.SetAttributes(
			attribute.String("error.type", "database"),
			attribute.String("error.message", fmt.Sprintf("error inserting internal HTTP server connection into the database: %s", err)),
		)
		dbSpan.End()
		return nil, err
	}

	dbSpan.End()

	output := Output{
		Channel: &channel,
	}

	return &output, nil
}
