package connectionsGet

import (
	"encoding/json"
	"time"

	"github.com/gofiber/fiber/v2"
	gruenthttp "github.com/ongruent/gruent/libs/http"
)

type ConnectionOut struct {
	ID                 string                 `json:"id"`
	Name               string                 `json:"name"`
	SpaceID            string                 `json:"space_id"`
	Attributes         map[string]interface{} `json:"attributes"`
	Internal           bool                   `json:"internal"`
	CreatedAt          time.Time              `json:"created_at"`
	UpdatedAt          time.Time              `json:"updated_at"`
	CreatedBy          string                 `json:"created_by"`
	UpdatedBy          string                 `json:"updated_by"`
	ConnectionCategory string                 `json:"connection_category"`
}

func respond(request *gruenthttp.Request[Input], output *Output) {
	request.Span.AddEvent("respond")

	var attributes map[string]interface{}
	if output.Connection.Attributes != nil {
		_ = json.Unmarshal(output.Connection.Attributes, &attributes)
	}

	connectionOut := ConnectionOut{
		ID:                 output.Connection.ID,
		Name:               output.Connection.Name,
		SpaceID:            output.Connection.SpaceID,
		Attributes:         attributes,
		Internal:           output.Connection.Internal,
		CreatedAt:          output.Connection.CreatedAt,
		UpdatedAt:          output.Connection.UpdatedAt,
		CreatedBy:          output.Connection.CreatedBy,
		UpdatedBy:          output.Connection.UpdatedBy,
		ConnectionCategory: output.Connection.ConnectionCategory,
	}

	response := gruenthttp.NewGetResponse(connectionOut)
	request.FiberContext.Status(fiber.StatusOK).JSON(response)
}
