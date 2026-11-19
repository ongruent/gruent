import update from './update'
import { createApiCallMock } from '../testHelpers'
import { ClientConfig } from '../index'
import { Connection } from '@prisma/client'

type ResponseData = Connection

describe('connections/update', () => {
  beforeEach(() => {
    jest.resetAllMocks()
  })

  it('should return updated connection', async () => {
    // Given
    const mockResponseData: ResponseData = {
      id: 'connection-id-fake',
      spaceId: 'space-id-fake',
      name: 'test',
      connectionCategory: 'CATEGORY_FAKE',
      attributes: {},
      internal: false,
      createdAt: new Date(),
      createdBy: 'user-id-fake',
      updatedAt: new Date(),
      updatedBy: 'user-id-fake',
    }

    const mockResponseCode = 200
    const mockResponseBody = { data: mockResponseData, errors: null }
    createApiCallMock<ResponseData>(mockResponseCode, mockResponseBody)

    // When
    const mockRequestData = {
      spaceId: 'space-id-fake',
      name: mockResponseData.name,
      attributes: mockResponseData.attributes,
    }

    const config: ClientConfig = { url: new URL('https://api.gruent.com') }
    const result = await update(
      'tea_fake',
      config,
      mockRequestData.spaceId,
      mockResponseData.id,
      mockRequestData,
    )

    // Then
    const expectedUrl = new URL('https://api.gruent.com/v1/connections/connection-id-fake')
    expectedUrl.searchParams.set('spaceId', mockRequestData.spaceId)
    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(global.fetch).toHaveBeenCalledWith(expectedUrl.toString(), {
      body: JSON.stringify({
        name: mockRequestData.name,
        attributes: mockRequestData.attributes,
      }),
      headers: {
        Authorization: 'Bearer tea_fake',
      },
      method: 'PUT',
    })
    expect(result.data).toEqual(mockResponseData)
  })
})
