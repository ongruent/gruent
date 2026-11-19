import { ClientConfig } from '..'
import { Connection } from '@prisma/client'
import { ApiResponse } from '../response'
import apiRequest from '../request'

type ResponseData = Connection

const updateConnection = async (
  key: string,
  config: ClientConfig,
  spaceId: string,
  connectionId: string,
  connectionInput: Pick<Connection, 'name' | 'attributes'>,
): Promise<ApiResponse<ResponseData>> => {
  const url = new URL(config.url)
  url.pathname = `v1/connections/${connectionId}`

  const requestBody = { name: connectionInput.name, attributes: connectionInput.attributes }

  const queryParams = new URLSearchParams()
  queryParams.set('spaceId', spaceId)

  return await apiRequest<ResponseData>(url, 'PUT', requestBody, {
    authorization: key,
    query: queryParams,
  })
}

export default updateConnection
