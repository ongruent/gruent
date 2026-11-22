package compiler

import (
	"encoding/json"

	"github.com/ongruent/gruent/services/controller/internal/plan"
)

const pluginHTTPResponse = "http-response"

// checkHTTPResponses requires HTTP response steps to be part of a channel whose source is an HTTP source
// that waits for the execution (sync), since only then is there a request to answer.
func (c *compilation) checkHTTPResponses(graph plan.Graph, sources []sourceStep) {
	var responders []string
	for _, step := range graph.Steps {
		if c.libraryCache[step.ID].is(pluginHTTPResponse, 1) {
			responders = append(responders, step.ID)
		}
	}
	if len(responders) == 0 || len(sources) != 1 {
		return
	}
	source := sources[0]
	if !source.library.is(pluginHTTPSource, 1) {
		for _, id := range responders {
			c.errorf("http_response_without_http_source", id, "", "step %s answers an HTTP request, but the channel's source is not an HTTP source", id)
		}
		return
	}
	var config struct {
		ResponseMode string `json:"responseMode"`
	}
	if err := json.Unmarshal(source.step.Config, &config); err == nil && config.ResponseMode != "sync" {
		for _, id := range responders {
			c.errorf("http_response_async_source", id, "", "step %s answers the HTTP request, but the HTTP source %s answers before the execution runs (%s); set its response mode to sync", id, source.step.ID, config.ResponseMode)
		}
	}
	if len(responders) > 1 {
		for _, id := range responders[1:] {
			c.warnf("multiple_http_responses", id, "", "the channel has several HTTP response steps; the first one to run answers the request")
		}
	}
}
