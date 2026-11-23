package trigger

import (
	"github.com/gofiber/fiber/v2"
	"github.com/ongruent/gruent/libs/legacy/engine/environment"
	"github.com/ongruent/gruent/services/http-api/api/middleware"
	"github.com/ongruent/gruent/services/http-api/api/v1/trigger/http/channelId"
	"github.com/ongruent/gruent/services/http-api/config"
	"github.com/ongruent/gruent/services/http-api/services/ingress"
)

func Register(app fiber.Router) {
	trigger := app.Group("/trigger")

	// We do performance testing on local and development environments,
	// so we want to let as many requests through as possible.
	if config.Env == environment.Production {
		trigger.Use(middleware.IpRateLimiter)
	}

	// HTTP trigger. Channels published to the runtime platform go through the ingress; others use the
	// legacy trigger.
	handler := ingress.Trigger(channelId.Handler)
	trigger.Get("/http/:channelId", handler)
	trigger.Post("/http/:channelId", handler)
	trigger.Put("/http/:channelId", handler)
	trigger.Delete("/http/:channelId", handler)
	trigger.Patch("/http/:channelId", handler)
	trigger.Head("/http/:channelId", handler)
}
