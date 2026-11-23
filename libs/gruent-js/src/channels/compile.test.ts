import compile from './compile'
import { createApiCallMock } from '../testHelpers'
import { ClientConfig } from '../index'
import { ChannelConfig } from '@gruent/libs/legacy/engine/channels/index'

describe('channels/compile', () => {
  beforeEach(() => {
    jest.resetAllMocks()
  })

  it('posts the draft configuration and returns the resolved types', async () => {
    // Given
    const mockResponseData = {
      valid: false,
      diagnostics: [{ severity: 'error' as const, code: 'invalid_mapping', message: 'm', stepId: 'n_map' }],
      types: [{ stepId: 'n_map', input: { kind: 'object', fields: [] } }],
    }
    createApiCallMock(200, { data: mockResponseData, errors: null })
    const channelConfig = { id: 'channel-id-fake', nodes: [], edges: [] } as unknown as ChannelConfig

    // When
    const config: ClientConfig = { url: new URL('https://api.gruent.io') }
    const result = await compile('tea_fake', config, 'space-id-fake', 'channel-id-fake', channelConfig)

    // Then
    const expectedUrl = new URL('https://api.gruent.io/v1/channels/channel-id-fake/compile')
    expectedUrl.searchParams.set('spaceId', 'space-id-fake')
    expect(global.fetch).toHaveBeenCalledWith(expectedUrl.toString(), {
      body: JSON.stringify({ config: channelConfig }),
      headers: { Authorization: 'Bearer tea_fake' },
      method: 'POST',
    })
    expect(result.data).toEqual(mockResponseData)
  })
})
