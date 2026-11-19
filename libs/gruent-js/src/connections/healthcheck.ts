import { ClientConfig } from '..'
import { Connection } from '@prisma/client'
import { ApiResponse } from '../response'
import apiRequest from '../request'

type ResponseData = Connection

const healthcheckConnection = async (
  key: string,
  config: ClientConfig,
  spaceId: string,
  category: string,
  attributes: Record<string, any>,
): Promise<ApiResponse<ResponseData>> => {
  const url = new URL(config.url)
  url.pathname = `v1/connections/healthcheck`

  const requestBody = { category, attributes }

  const queryParams = new URLSearchParams()
  queryParams.set('spaceId', spaceId)

  return await apiRequest<ResponseData>(url, 'PATCH', requestBody, {
    authorization: key,
    query: queryParams,
  })
}

export default healthcheckConnection
