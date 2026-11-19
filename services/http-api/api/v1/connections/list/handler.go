package connectionsList

import (
	"github.com/gofiber/fiber/v2"
	sqldb "github.com/ongruent/gruent/db/sqlc"
	"github.com/ongruent/gruent/libs/legacy/engine/dependencies/things"
)

type Input struct {
	BearerToken        string `validate:"required"`
	SpaceId            string `validate:"required"`
	ConnectionCategory *things.ThingCategory
	Page               int `validate:"gt=0"`
	ResultsPerPage     int `validate:"gt=0,lte=100"`
	Filter             string
	TagFilter          []string
}

type Output struct {
	Connections    []sqldb.AppConnection
	Page           int
	TotalPages     int
	TotalResults   int
	ResultsPerPage int
}

// @Summary List connections
// @Description Given a space, list the connections in a space. Optionally filter by connection category.
// @Tags connections
// @Accept  json
// @Produce  json
// @Param   spaceId	query	string	true	"Space ID"
// @Param   connectionCategory	query	string	false	"Connection Category"
// @Param   page	query	int	false	"Page"
// @Param   resultsPerPage	query	int	false	"Results per page"
// @Success 200
// @Router /connections [get]
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
