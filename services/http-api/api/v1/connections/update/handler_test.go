package connectionsUpdate_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	gruenthttp "github.com/ongruent/gruent/libs/http"
	"github.com/ongruent/gruent/libs/id"
	gruentchannel "github.com/ongruent/gruent/libs/legacy/engine/channels"
	"github.com/ongruent/gruent/prisma/db"
	apitest "github.com/ongruent/gruent/services/http-api/api/test"
	connectionsUpdate "github.com/ongruent/gruent/services/http-api/api/v1/connections/update"
	"github.com/ongruent/gruent/services/http-api/util"
	"github.com/steebchen/prisma-client-go/runtime/types"
	"github.com/stretchr/testify/assert"
)

func TestHandler(t *testing.T) {
	route := "/v1/connections/:connectionId"

	apitest.HandlerUnitTestWithSetup(
		t,
		route,
		connectionsUpdate.Handler,
		"successfully updates connection",
		func(t *testing.T, mocks *apitest.HandlerMocks) {
			// given
			// define prisma mock server response for bearer token
			apitest.SetupExpectSpaceApiKey(mocks.DB)

			// define prisma mock server response
			testSpaceId, _ := id.Generator.NewSpaceId()
			testConnectionId, _ := id.Generator.NewConnectionId()
			testConnectionName := "Test Connection"
			testConnectionAttributes := map[string]any{
				"test": "attributes",
			}
			testConnectionAttributesJson, _ := json.Marshal(testConnectionAttributes)

			expectedDatabaseOutput := db.ConnectionModel{
				InnerConnection: db.InnerConnection{
					ID:         *testConnectionId,
					Name:       testConnectionName,
					Attributes: testConnectionAttributesJson, // empty attributes - required by mock Prisma client
				},
			}

			expectedDatabaseChannelOutput := []db.ChannelModel{
				{
					InnerChannel: db.InnerChannel{
						Config: types.JSON{'{', '}'}, // empty config - required by mock Prisma client
					},
				},
			}

			expectedDatabaseConnectionsOutput := []db.ConnectionModel{
				{
					InnerConnection: db.InnerConnection{
						Attributes: types.JSON{'{', '}'}, // empty attributes - required by mock Prisma client
					},
				},
			}

			mocks.DB.Server.Channel.Expect(
				mocks.DB.Client.Channel.FindMany(
					db.Channel.SpaceID.Equals(*testSpaceId),
				).Select(
					db.Channel.PublishedAt.Field(),
					db.Channel.Config.Field(),
				),
			).ReturnsMany(expectedDatabaseChannelOutput)

			mocks.DB.Server.Connection.Expect(
				mocks.DB.Client.Connection.FindMany(
					db.Connection.SpaceID.Equals(*testSpaceId),
				).Select(
					db.Connection.Attributes.Field(),
				),
			).ReturnsMany(expectedDatabaseConnectionsOutput)

			mocks.DB.Server.Connection.Expect(
				mocks.DB.Client.Connection.FindUnique(
					db.Connection.ID.Equals(*testConnectionId),
				).Update(
					db.Connection.Name.Set(testConnectionName),
					db.Connection.Attributes.Set(testConnectionAttributesJson),

					// TODO: add user ID to input and set updatedBy
					db.Connection.UpdatedBy.Set("tea_fake"),
					db.Connection.UpdatedAt.Set(util.GetCurrentTime()),
				),
			).Returns(expectedDatabaseOutput)

			// when
			// API route is called
			httptestRequestBody := map[string]any{
				"name":       testConnectionName,
				"attributes": testConnectionAttributes,
			}
			marshalledHttptestRequestBody, _ := json.Marshal(&httptestRequestBody)
			routeWithConnectionId := strings.ReplaceAll(route, ":connectionId", *testConnectionId)
			routeWithQueryParams := fmt.Sprintf("%s?spaceId=%s", routeWithConnectionId, *testSpaceId)
			httptestRequest := httptest.NewRequest("PUT", routeWithQueryParams, bytes.NewBuffer(marshalledHttptestRequestBody))
			httptestRequest.Header.Add("Authorization", "Bearer tea_fake")

			httptestResponse, _ := mocks.API.App.Test(httptestRequest)

			// then
			// parse response body
			responseBodyBytes, err := io.ReadAll(httptestResponse.Body)
			if err != nil {
				t.Fatalf("Failed to read response body: %v", err)
			}

			var response gruenthttp.GruentApiResponse
			err = json.Unmarshal(responseBodyBytes, &response)
			if err != nil {
				t.Fatalf("Failed to unmarshal response body: %v", err)
			}

			// check that Data is a db.ConnectionModel (marshal into JSON and unmarshal as a db.ConnectionModel)
			responseBodyJson, err := json.Marshal(response.Data)
			if err != nil {
				t.Fatalf("Failed to marshal response data back to JSON: %v", err)
			}

			var connection db.ConnectionModel
			err = json.Unmarshal(responseBodyJson, &connection)
			if err != nil {
				t.Fatalf("Failed to unmarshal data into db.ConnectionModel: %v", err)
			}

			// assert response status and body
			assert.Equalf(t, http.StatusOK, httptestResponse.StatusCode, "matching response code")
			assert.Equal(t, connection.ID, *testConnectionId, "connection has the same connection ID as the database output")
		},
	)

	apitest.HandlerUnitTestWithSetup(
		t,
		route,
		connectionsUpdate.Handler,
		"prevents connection update when in use by a channel",
		func(t *testing.T, mocks *apitest.HandlerMocks) {
			// given
			// define prisma mock server response for bearer token
			apitest.SetupExpectSpaceApiKey(mocks.DB)

			// define prisma mock server response
			testSpaceId, _ := id.Generator.NewSpaceId()
			testConnectionId, _ := id.Generator.NewConnectionId()

			exampleConfigWithConnection := gruentchannel.Channel{
				Nodes: []gruentchannel.Node{
					{
						Metadata: gruentchannel.NodeMetadata{
							Dependencies: gruentchannel.NodeDependencies{
								Things: []gruentchannel.NodeThingDependency{
									{
										ConnectionId: *testConnectionId,
									},
								},
							},
						},
					},
				},
			}

			exampleConfigWithConnectionJson, _ := json.Marshal(exampleConfigWithConnection)

			publishedAt := time.Now()
			expectedDatabaseChannelOutput := []db.ChannelModel{
				{
					InnerChannel: db.InnerChannel{
						PublishedAt: &publishedAt,
						Config:      exampleConfigWithConnectionJson, // empty config - required by mock Prisma client
					},
				},
			}

			mocks.DB.Server.Channel.Expect(
				mocks.DB.Client.Channel.FindMany(
					db.Channel.SpaceID.Equals(*testSpaceId),
				).Select(
					db.Channel.PublishedAt.Field(),
					db.Channel.Config.Field(),
				),
			).ReturnsMany(expectedDatabaseChannelOutput)

			// run integration test
			httptestRequestBody := map[string]any{
				"name": "Test Connection",
				"attributes": map[string]any{
					"test": "attributes",
				},
			}
			marshalledHttptestRequestBody, _ := json.Marshal(&httptestRequestBody)
			routeWithConnectionId := strings.ReplaceAll(route, ":connectionId", *testConnectionId)
			routeWithQueryParams := fmt.Sprintf("%s?spaceId=%s", routeWithConnectionId, *testSpaceId)
			httptestRequest := httptest.NewRequest("DELETE", routeWithQueryParams, bytes.NewBuffer(marshalledHttptestRequestBody))
			httptestRequest.Header.Add("Authorization", "Bearer tea_fake")

			httptestResponse, err := mocks.API.App.Test(httptestRequest)

			// assert nil error
			assert.Nil(t, err)

			// assert response status
			assert.Equalf(t, http.StatusConflict, httptestResponse.StatusCode, "matching response code")
		},
	)
}
