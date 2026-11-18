import { ClientConfig } from '..'
import { Connection } from '@prisma/client'
import { ApiResponse } from '../response'
import apiRequest from '../request'

type ResponseData = Connection

const createConnection = async (
  key: string,
  config: ClientConfig,
  spaceId: string,
  name: string,
  category: string,
  attributes: Object,
): Promise<ApiResponse<ResponseData>> => {
  const url = new URL(config.url)
  url.pathname = `v1/connections`

  const requestBody = { name, category, attributes }

  const queryParams = new URLSearchParams()
  queryParams.set('spaceId', spaceId)

  return await apiRequest<ResponseData>(url, 'POST', requestBody, {
    authorization: key,
    query: queryParams,
  })
}

export default createConnection
