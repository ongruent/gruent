import get from './get'
import { createApiCallMock } from '../testHelpers'
import { ClientConfig } from '../index'
import { Connection } from '@prisma/client'

type ResponseData = Connection

describe('connections/get', () => {
  beforeEach(() => {
    jest.resetAllMocks()
  })

  it('should return connection', async () => {
    // Given
    const mockResponseData: ResponseData = {
      id: 'connection-id-fake',
      name: 'test',
      spaceId: 'space-id-fake',
      attributes: {},
      internal: false,
      connectionCategory: 'CATEGORY_FAKE',
      createdBy: 'user-id-fake',
      updatedBy: 'user-id-fake',
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const mockResponseCode = 200
    const mockResponseBody = { data: mockResponseData, errors: null }
    createApiCallMock<ResponseData>(mockResponseCode, mockResponseBody)

    // When
    const mockRequestData = {
      spaceId: 'space-id-fake',
      connectionId: 'connection-id-fake',
    }

    const config: ClientConfig = { url: new URL('https://api.gruent.io') }
    const result = await get(
      'tea_fake',
      config,
      mockRequestData.spaceId,
      mockRequestData.connectionId,
    )

    // Then
    const expectedUrl = new URL('https://api.gruent.io/v1/connections/connection-id-fake')
    expectedUrl.searchParams.set('spaceId', mockRequestData.spaceId)

    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(global.fetch).toHaveBeenCalledWith(expectedUrl.toString(), {
      headers: {
        Authorization: 'Bearer tea_fake',
      },
      method: 'GET',
    })
    expect(result.data).toEqual(mockResponseData)
  })
})
