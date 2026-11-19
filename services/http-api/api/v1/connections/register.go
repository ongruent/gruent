package connections

import (
	"github.com/gofiber/fiber/v2"

	"github.com/ongruent/gruent/services/http-api/api/middleware"
	connectionsCreate "github.com/ongruent/gruent/services/http-api/api/v1/connections/create"
	connectionsDelete "github.com/ongruent/gruent/services/http-api/api/v1/connections/delete"
	connectionsGet "github.com/ongruent/gruent/services/http-api/api/v1/connections/get"
	connectionsHealthcheck "github.com/ongruent/gruent/services/http-api/api/v1/connections/healthcheck"
	connectionsList "github.com/ongruent/gruent/services/http-api/api/v1/connections/list"
	connectionsUpdate "github.com/ongruent/gruent/services/http-api/api/v1/connections/update"
)

func Register(app fiber.Router) {
	connections := app.Group("connections")

	connections.Use(middleware.ValidateBearerToken)
	connections.Use(middleware.UserRateLimiter)

	connections.Get("/", connectionsList.Handler)
	connections.Post("/", connectionsCreate.Handler)
	connections.Patch("/healthcheck", connectionsHealthcheck.Handler)
	connections.Get("/:connectionId", connectionsGet.Handler)
	connections.Put("/:connectionId", connectionsUpdate.Handler)
	connections.Delete("/:connectionId", connectionsDelete.Handler)
}
