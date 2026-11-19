package channelsCompile

import (
	"encoding/json"

	"github.com/gofiber/fiber/v2"
	gruenthttp "github.com/ongruent/gruent/libs/http"
	gruenthttputil "github.com/ongruent/gruent/libs/http/util"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/trace"
)

type requestBody struct {
	Config       json.RawMessage `json:"config"`
	Step         json.RawMessage `json:"step"`
	UpstreamType json.RawMessage `json:"upstreamType"`
}

func parse(ctx *fiber.Ctx) (*gruenthttp.Request[Input], error) {
	requestSpan := trace.SpanFromContext(ctx.UserContext())
	requestSpan.AddEvent("parse")

	spaceId := ctx.Query("spaceId")
	channelId := ctx.Params("channelId")
	requestSpan.SetAttributes(
		attribute.String("query.spaceId", spaceId),
		attribute.String("params.channelId", channelId),
	)

	bearerToken, err := gruenthttputil.ParseBearerToken(ctx.Get("Authorization"))
	if err != nil {
		requestSpan.SetAttributes(
			attribute.String("error.type", "parse_bearer_token"),
			attribute.String("error.message", err.Error()),
		)
		return nil, err
	}

	var body requestBody
	if len(ctx.Body()) > 0 {
		if err := json.Unmarshal(ctx.Body(), &body); err != nil {
			errorResponse := gruenthttp.NewErrorResponse([]any{err.Error()})
			responseJson, _ := errorResponse.MarshalJson()
			return nil, fiber.NewError(fiber.StatusBadRequest, string(responseJson))
		}
	}

	request := &gruenthttp.Request[Input]{
		Span:         requestSpan,
		FiberContext: ctx,
		Context:      ctx.UserContext(),
		Input: Input{
			BearerToken:  *bearerToken,
			SpaceId:      spaceId,
			ChannelId:    channelId,
			Config:       body.Config,
			Step:         body.Step,
			UpstreamType: body.UpstreamType,
		},
	}

	return request, nil
}
