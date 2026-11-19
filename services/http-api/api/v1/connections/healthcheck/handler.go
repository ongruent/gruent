package connectionsHealthcheck

import (
	"github.com/gofiber/fiber/v2"
)

type Input struct {
	BearerToken        string         `validate:"required"`
	SpaceId            string         `validate:"required"`
	ConnectionCategory string         `validate:"required"`
	Attributes         map[string]any `validate:"required"`
}

type Output struct{}

// @Summary Healthcheck connection attributes
// @Description Given a connection category and attributes, healthcheck that connection.
// @Tags connections
// @Accept  json
// @Produce  json
// @Param   spaceId	query	string	true	"Space ID"
// @Param   connectionCategory	query	string	true	"Connection Category"
// @Param   attributes	body	Input	true	"Attributes"
// @Success 200
// @Router /connections/healthcheck [patch]
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
