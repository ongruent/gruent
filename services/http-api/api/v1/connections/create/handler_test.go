package connectionsCreate_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/ongruent/gruent/libs/id"
	"github.com/ongruent/gruent/libs/legacy/engine/dependencies/things"
	"github.com/ongruent/gruent/prisma/db"
	apitest "github.com/ongruent/gruent/services/http-api/api/test"
	connectionsCreate "github.com/ongruent/gruent/services/http-api/api/v1/connections/create"
	"github.com/ongruent/gruent/services/http-api/util"
	"github.com/stretchr/testify/assert"
)

func TestHandler(t *testing.T) {
	route := "/v1/connections/:connectionId"

	apitest.HandlerUnitTestWithSetup(
		t,
		route,
		connectionsCreate.Handler,
		"successfully creates an HTTP server connection",
		func(t *testing.T, mocks *apitest.HandlerMocks) {
			// given
			// define prisma mock server response for bearer token
			apitest.SetupExpectSpaceApiKey(mocks.DB)

			// define prisma mock server response
			testSpaceId, _ := id.Generator.NewSpaceId()
			testConnectionId, _ := id.Generator.NewConnectionId()
			testAttributes := things.HttpServer{
				Host:     "gruent.com",
				Protocol: "https",
				Port:     443,
				Paths: []string{
					"/test",
				},
			}

			requestBody := map[string]any{
				"name":       "test",
				"category":   things.HttpServerThingCategory.String(),
				"attributes": testAttributes,
			}

			testAttributesJson, _ := json.Marshal(testAttributes)
			requestBodyJson, _ := json.Marshal(requestBody)

			expectedDatabaseConnectionOutput := db.ConnectionModel{
				InnerConnection: db.InnerConnection{
					Attributes: testAttributesJson,
				},
			}

			now := util.GetCurrentTime()
			mocks.DB.Server.Connection.Expect(
				mocks.DB.Client.Connection.CreateOne(
					db.Connection.ID.Set(*testConnectionId),
					db.Connection.Name.Set("test"),
					db.Connection.Attributes.Set(testAttributesJson),
					db.Connection.CreatedBy.Set("tea_fake"),
					db.Connection.UpdatedBy.Set("tea_fake"),
					db.Connection.ConnectionCategory.Set(things.HttpServerThingCategory.String()),
					db.Connection.Space.Link(
						db.Space.ID.Equals(*testSpaceId),
					),
					db.Connection.CreatedAt.Set(now),
					db.Connection.UpdatedAt.Set(now),
				),
			).Returns(expectedDatabaseConnectionOutput)

			// run integration test
			routeWithQueryParams := fmt.Sprintf("%s?spaceId=%s", route, *testSpaceId)
			httptestRequest := httptest.NewRequest("POST", routeWithQueryParams, bytes.NewReader(requestBodyJson))
			httptestRequest.Header.Add("Authorization", "Bearer tea_fake")
			httptestResponse, err := mocks.API.App.Test(httptestRequest)

			// assert nil error
			assert.Nil(t, err)

			// assert response status
			assert.Equalf(t, http.StatusCreated, httptestResponse.StatusCode, "matching response code")
		},
	)

	// TODO: create tests for MQTT broker and MQTT client types when external certificates are supported
}
