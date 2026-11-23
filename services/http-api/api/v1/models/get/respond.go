package modelsGet

import (
	"encoding/json"
	"time"

	"github.com/gofiber/fiber/v2"
	gruenthttp "github.com/ongruent/gruent/libs/http"
)

type ModelOut struct {
	ID         string                 `json:"id"`
	SpaceID    string                 `json:"space_id"`
	Name       string                 `json:"name"`
	Attributes map[string]interface{} `json:"attributes"`
	CreatedAt  time.Time              `json:"created_at"`
	UpdatedAt  time.Time              `json:"updated_at"`
	CreatedBy  string                 `json:"created_by"`
	UpdatedBy  string                 `json:"updated_by"`
}

func respond(request *gruenthttp.Request[Input], output *Output) {
	request.Span.AddEvent("respond")

	attributes := make(map[string]interface{})
	_ = json.Unmarshal(output.Model.Attributes, &attributes)

	modelOut := ModelOut{
		ID:         output.Model.ID,
		SpaceID:    output.Model.SpaceID,
		Name:       output.Model.Name,
		Attributes: attributes,
		CreatedAt:  output.Model.CreatedAt,
		UpdatedAt:  output.Model.UpdatedAt,
		CreatedBy:  output.Model.CreatedBy,
		UpdatedBy:  output.Model.UpdatedBy,
	}

	response := gruenthttp.NewGetResponse(modelOut)
	request.FiberContext.Status(fiber.StatusOK).JSON(response)
}
