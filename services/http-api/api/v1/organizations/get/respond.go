package organizationsGet

import (
	"time"

	"github.com/gofiber/fiber/v2"
	db "github.com/ongruent/gruent/db/sqlc"
	gruenthttp "github.com/ongruent/gruent/libs/http"
)

type OrganizationOut struct {
	ID        string        `json:"id"`
	Name      string        `json:"name"`
	CreatedAt time.Time     `json:"created_at"`
	CreatedBy string        `json:"created_by"`
	UpdatedAt time.Time     `json:"updated_at"`
	UpdatedBy string        `json:"updated_by"`
	Spaces    []db.AppSpace `json:"spaces"`
}

func respond(request *gruenthttp.Request[Input], output *Output) {
	request.Span.AddEvent("respond")

	organizationOut := OrganizationOut{
		ID:        output.Organization.ID,
		Name:      output.Organization.Name,
		CreatedAt: output.Organization.CreatedAt,
		CreatedBy: output.Organization.CreatedBy,
		UpdatedAt: output.Organization.UpdatedAt,
		UpdatedBy: output.Organization.UpdatedBy,
		Spaces:    output.Spaces,
	}

	response := gruenthttp.NewGetResponse(organizationOut)
	request.FiberContext.Status(fiber.StatusOK).JSON(response)
}
