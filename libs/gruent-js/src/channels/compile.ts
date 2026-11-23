import { ChannelConfig } from '@gruent/libs/legacy/engine/channels/index'
import { ClientConfig } from '..'
import apiRequest from '../request'
import { ApiResponse } from '../response'

/** A payload type resolved by the controller. */
export type CompiledType = {
  kind: string
  fields?: { name: string; type: CompiledType; required?: boolean }[]
  items?: CompiledType
  modelRef?: string
}

export type CompileDiagnostic = {
  severity: 'error' | 'warning'
  code: string
  message: string
  stepId?: string
  path?: string
}

type ResponseData = {
  valid: boolean
  diagnostics: CompileDiagnostic[]
  /** Resolved types of every step. input is absent for sources and when it could not be resolved. */
  types: { stepId: string; input?: CompiledType; output?: CompiledType }[]
}

/** Soft-compiles a draft channel configuration without saving or publishing it. */
const compileChannel = async (
  key: string,
  config: ClientConfig,
  spaceId: string,
  channelId: string,
  channelConfig: ChannelConfig,
): Promise<ApiResponse<ResponseData>> => {
  const url = new URL(config.url)
  url.pathname = `v1/channels/${channelId}/compile`

  const queryParams = new URLSearchParams()
  queryParams.set('spaceId', spaceId)

  return await apiRequest<ResponseData>(
    url,
    'POST',
    { config: channelConfig },
    { authorization: key, query: queryParams },
  )
}

export default compileChannel
