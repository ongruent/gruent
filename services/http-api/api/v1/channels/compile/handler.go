package channelsCompile

import (
	"encoding/json"

	"github.com/gofiber/fiber/v2"
)

type Input struct {
	BearerToken string `validate:"required"`
	SpaceId     string `validate:"required"`
	ChannelId   string `validate:"required"`
	// Draft channel configuration. The saved configuration is compiled if this and Step are empty.
	Config json.RawMessage
	// Step-only compilation: one step of the channel, as stored in its "nodes".
	Step json.RawMessage
	// Step-only compilation: the output type of the upstream step, as returned in "types".
	UpstreamType json.RawMessage
}

type Output struct {
	Valid       bool              `json:"valid"`
	Diagnostics []Diagnostic      `json:"diagnostics"`
	Types       json.RawMessage   `json:"types"`
	Versions    *ArtifactVersions `json:"versions,omitempty"`
}

type Diagnostic struct {
	Severity string `json:"severity"`
	Code     string `json:"code"`
	Message  string `json:"message"`
	StepId   string `json:"stepId,omitempty"`
	Path     string `json:"path,omitempty"`
}

// ArtifactVersions are the versions publishing the compiled configuration would produce.
type ArtifactVersions struct {
	Plan             string `json:"plan"`
	DependencyBundle string `json:"dependencyBundle"`
	PayloadSchema    string `json:"payloadSchema"`
	Routing          string `json:"routing"`
}

// @Summary Soft-compile a channel or step
// @Description Validates a channel configuration (the saved one, or a draft in "config") or a single step ("step", with the upstream step's output type in "upstreamType"), using the same rules as publishing. Returns diagnostics and the resolved input and output types of each step. Nothing is published or deployed.
// @Tags channels
// @Accept  json
// @Produce  json
// @Param   spaceId	query	string	true	"Space ID"
// @Param   channelId	path	string	true	"Channel ID"
// @Success 200
// @Router /channels/{channelId}/compile [post]
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
