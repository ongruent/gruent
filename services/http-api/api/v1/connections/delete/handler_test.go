package connectionsDelete_test

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/ongruent/gruent/libs/id"
	gruentchannel "github.com/ongruent/gruent/libs/legacy/engine/channels"
	"github.com/ongruent/gruent/prisma/db"
	apitest "github.com/ongruent/gruent/services/http-api/api/test"
	connectionsDelete "github.com/ongruent/gruent/services/http-api/api/v1/connections/delete"
	"github.com/steebchen/prisma-client-go/runtime/types"
	"github.com/stretchr/testify/assert"
)

func TestHandler(t *testing.T) {
	route := "/v1/connections/:connectionId"

	apitest.HandlerUnitTestWithSetup(
		t,
		route,
		connectionsDelete.Handler,
		"successfully deletes connection",
		func(t *testing.T, mocks *apitest.HandlerMocks) {
			// given
			// define prisma mock server response for bearer token
			apitest.SetupExpectSpaceApiKey(mocks.DB)

			// define prisma mock server response
			testSpaceId, _ := id.Generator.NewSpaceId()
			testConnectionId, _ := id.Generator.NewConnectionId()

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
						Attributes: types.JSON{'{', '}'}, // empty config - required by mock Prisma client
					},
				},
			}

			mocks.DB.Server.Channel.Expect(
				mocks.DB.Client.Channel.FindMany(
					db.Channel.SpaceID.Equals(*testSpaceId),
				).Select(
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

			expectedDatabaseConnectionOutput := db.ConnectionModel{
				InnerConnection: db.InnerConnection{
					Attributes: types.JSON{'{', '}'}, // empty config - required by mock Prisma client
				},
			}

			mocks.DB.Server.Connection.Expect(
				mocks.DB.Client.Connection.FindUnique(
					db.Connection.ID.Equals(*testConnectionId),
				).Delete(),
			).Returns(expectedDatabaseConnectionOutput)

			// run integration test
			routeWithConnectionId := strings.ReplaceAll(route, ":connectionId", *testConnectionId)
			routeWithQueryParams := fmt.Sprintf("%s?spaceId=%s", routeWithConnectionId, *testSpaceId)
			httptestRequest := httptest.NewRequest("DELETE", routeWithQueryParams, nil)
			httptestRequest.Header.Add("Authorization", "Bearer tea_fake")

			httptestResponse, err := mocks.API.App.Test(httptestRequest)

			// assert nil error
			assert.Nil(t, err)

			// assert response status
			assert.Equalf(t, http.StatusOK, httptestResponse.StatusCode, "matching response code")
		},
	)

	apitest.HandlerUnitTestWithSetup(
		t,
		route,
		connectionsDelete.Handler,
		"prevents connection deletion when in use by a channel",
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

			expectedDatabaseChannelOutput := []db.ChannelModel{
				{
					InnerChannel: db.InnerChannel{
						Config: exampleConfigWithConnectionJson, // empty config - required by mock Prisma client
					},
				},
			}

			mocks.DB.Server.Channel.Expect(
				mocks.DB.Client.Channel.FindMany(
					db.Channel.SpaceID.Equals(*testSpaceId),
				).Select(
					db.Channel.Config.Field(),
				),
			).ReturnsMany(expectedDatabaseChannelOutput)

			// run integration test
			routeWithConnectionId := strings.ReplaceAll(route, ":connectionId", *testConnectionId)
			routeWithQueryParams := fmt.Sprintf("%s?spaceId=%s", routeWithConnectionId, *testSpaceId)
			httptestRequest := httptest.NewRequest("DELETE", routeWithQueryParams, nil)
			httptestRequest.Header.Add("Authorization", "Bearer tea_fake")

			httptestResponse, err := mocks.API.App.Test(httptestRequest)

			// assert nil error
			assert.Nil(t, err)

			// assert response status
			assert.Equalf(t, http.StatusConflict, httptestResponse.StatusCode, "matching response code")
		},
	)
}
