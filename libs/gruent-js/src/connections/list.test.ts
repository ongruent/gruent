import list from './list'
import { createApiCallMock } from '../testHelpers'
import { ClientConfig } from '../index'
import { Connection } from '@prisma/client'

type ResponseData = Connection[]

describe('connections/list', () => {
  beforeEach(() => {
    jest.resetAllMocks()
  })

  it('should return list of connections in the space', async () => {
    // Given
    const mockResponseData: ResponseData = [
      {
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
      },
    ]

    const mockResponseCode = 200
    const mockResponseBody = { data: mockResponseData, errors: null }
    createApiCallMock<ResponseData>(mockResponseCode, mockResponseBody)

    // When
    const mockRequestData = {
      spaceId: 'space-id-fake',
    }

    const config: ClientConfig = { url: new URL('https://api.gruent.com') }
    const result = await list('tea_fake', config, mockRequestData.spaceId)

    // Then
    const expectedUrl = new URL('https://api.gruent.com/v1/connections')
    expectedUrl.searchParams.set('spaceId', mockRequestData.spaceId)
    expectedUrl.searchParams.set('page', '1')
    expectedUrl.searchParams.set('resultsPerPage', '10')

    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(global.fetch).toHaveBeenCalledWith(expectedUrl.toString(), {
      headers: {
        Authorization: 'Bearer tea_fake',
      },
      method: 'GET',
    })
    expect(result.data).toEqual(mockResponseData)
  })

  it('should return list of connections of a specific category in the space', async () => {
    // Given
    const mockResponseData: ResponseData = [
      {
        id: 'connection-id-fake',
        name: 'test',
        spaceId: 'space-id-fake',
        attributes: {},
        internal: false,
        connectionCategory: 'HTTP_SERVER',
        createdBy: 'user-id-fake',
        updatedBy: 'user-id-fake',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]

    const mockResponseCode = 200
    const mockResponseBody = { data: mockResponseData, errors: null }
    createApiCallMock<ResponseData>(mockResponseCode, mockResponseBody)

    // When
    const mockRequestData = {
      spaceId: 'space-id-fake',
    }

    const config: ClientConfig = { url: new URL('https://api.gruent.com') }
    const result = await list('tea_fake', config, mockRequestData.spaceId, {
      category: 'HTTP_SERVER',
    })

    // Then
    const expectedUrl = new URL('https://api.gruent.com/v1/connections')
    expectedUrl.searchParams.set('spaceId', mockRequestData.spaceId)
    expectedUrl.searchParams.set('page', '1')
    expectedUrl.searchParams.set('resultsPerPage', '10')
    expectedUrl.searchParams.set('category', 'HTTP_SERVER')

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
