package connectionsList

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

	connectionsOut := make([]ConnectionOut, 0, len(output.Connections))
	for _, connection := range output.Connections {
		var attributes map[string]interface{}
		if connection.Attributes != nil {
			_ = json.Unmarshal(connection.Attributes, &attributes)
		}

		connectionOut := ConnectionOut{
			ID:                 connection.ID,
			Name:               connection.Name,
			SpaceID:            connection.SpaceID,
			Attributes:         attributes,
			Internal:           connection.Internal,
			CreatedAt:          connection.CreatedAt,
			UpdatedAt:          connection.UpdatedAt,
			CreatedBy:          connection.CreatedBy,
			UpdatedBy:          connection.UpdatedBy,
			ConnectionCategory: connection.ConnectionCategory,
		}

		connectionsOut = append(connectionsOut, connectionOut)
	}

	response := gruenthttp.NewListResponse(connectionsOut, &output.Page, &output.TotalPages, &output.TotalResults, &output.ResultsPerPage)
	request.FiberContext.Status(fiber.StatusOK).JSON(response)
}
