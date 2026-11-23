package modelsList

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

	modelsOut := make([]ModelOut, 0, len(output.Models))
	for _, model := range output.Models {
		var attributes map[string]interface{}
		if model.Attributes != nil {
			_ = json.Unmarshal(model.Attributes, &attributes)
		}
		modelsOut = append(modelsOut, ModelOut{
			ID:         model.ID,
			SpaceID:    model.SpaceID,
			Name:       model.Name,
			Attributes: attributes,
			CreatedAt:  model.CreatedAt,
			UpdatedAt:  model.UpdatedAt,
			CreatedBy:  model.CreatedBy,
			UpdatedBy:  model.UpdatedBy,
		})
	}

	response := gruenthttp.NewListResponse(modelsOut, &output.Page, &output.TotalPages, &output.TotalResults, &output.ResultsPerPage)
	request.FiberContext.Status(fiber.StatusOK).JSON(response)
}
