package connectionsUpdate

import (
	"github.com/gofiber/fiber/v2"
	sqldb "github.com/ongruent/gruent/db/sqlc"
)

type Input struct {
	BearerToken  string         `validate:"required"`
	SpaceId      string         `validate:"required"`
	ConnectionId string         `validate:"required"`
	Name         string         `validate:"required"`
	Attributes   map[string]any `validate:"required"`
}

type Output struct {
	Connection *sqldb.AppConnection `json:"connection"`
}

// @Summary Update a connection
// @Description Given a connection ID, name, and attributes, update the details of that connection.
// @Tags connections
// @Accept  json
// @Produce  json
// @Param   spaceId query	string	true	"Space ID"
// @Param   connectionId	path	string	true	"Connection ID"
// @Param request body connectionsUpdate.parse.RequestBody true "Body"
// @Success 200
// @Router /connections/{connectionId} [put]
// @Security ApiKeyAuth
func Handler(ctx *fiber.Ctx) error {
	request, err := parse(ctx)
	if err != nil {
		return err
	}

	err = validate(request)
	if err != nil {
		return err
	}

	err = contextValidate(request)
	if err != nil {
		return err
	}

	output, err := execute(request)
	if err != nil {
		return err
	}

	respond(request, output)

	go action(output)

	return nil
}
