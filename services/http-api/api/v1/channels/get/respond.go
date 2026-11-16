package channelsGet

import (
	"encoding/json"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgtype"
	gruenthttp "github.com/ongruent/gruent/libs/http"
)

type ChannelOut struct {
	ID          string                 `json:"id"`
	Name        string                 `json:"name"`
	SpaceID     string                 `json:"space_id"`
	Config      map[string]interface{} `json:"config"`
	CreatedAt   time.Time              `json:"created_at"`
	CreatedBy   string                 `json:"created_by"`
	UpdatedAt   time.Time              `json:"updated_at"`
	UpdatedBy   string                 `json:"updated_by"`
	PublishedAt pgtype.Timestamptz     `json:"published_at"`
	PublishedBy *string                `json:"published_by"`
}

func respond(request *gruenthttp.Request[Input], output *Output) {
	request.Span.AddEvent("respond")

	var decodedChannelConfig map[string]interface{}
	if output.Channel.Config != nil {
		err := json.Unmarshal(output.Channel.Config, &decodedChannelConfig)
		if err != nil {
			request.Span.RecordError(err)
			return
		}
	}

	channelOut := ChannelOut{
		ID:          output.Channel.ID,
		Name:        output.Channel.Name,
		SpaceID:     output.Channel.SpaceID,
		Config:      decodedChannelConfig,
		CreatedAt:   output.Channel.CreatedAt,
		CreatedBy:   output.Channel.CreatedBy,
		UpdatedAt:   output.Channel.UpdatedAt,
		UpdatedBy:   output.Channel.UpdatedBy,
		PublishedAt: output.Channel.PublishedAt,
		PublishedBy: output.Channel.PublishedBy,
	}

	response := gruenthttp.NewGetResponse(channelOut)
	request.FiberContext.Status(fiber.StatusOK).JSON(response)
}
