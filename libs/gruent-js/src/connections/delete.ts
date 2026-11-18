import { ClientConfig } from '..'
import apiRequest from '../request'
import { ApiResponse } from '../response'

type ResponseData = null

const deleteConnection = async (
  key: string,
  config: ClientConfig,
  spaceId: string,
  connectionId: string,
): Promise<ApiResponse<ResponseData>> => {
  const url = new URL(config.url)
  url.pathname = `v1/connections/${connectionId}`

  const queryParams = new URLSearchParams()
  queryParams.set('spaceId', spaceId)

  return await apiRequest<ResponseData>(url, 'DELETE', null, {
    authorization: key,
    query: queryParams,
  })
}

export default deleteConnection
