package connectionsGet

import (
	"github.com/gofiber/fiber/v2"
	sqldb "github.com/ongruent/gruent/db/sqlc"
)

type Input struct {
	BearerToken  string
	SpaceId      string
	ConnectionId string
}

type Output struct {
	Connection *sqldb.AppConnection
}

// @Summary Get a connection
// @Description Given a connection ID, retrieve the details of a connection.
// @Tags connections
// @Accept  json
// @Produce  json
// @Param   connectionId	path	string	true	"Connection ID"
// @Param   spaceId	query	string	true	"Space ID"
// @Success 200
// @Router /connections/{connectionId} [get]
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
