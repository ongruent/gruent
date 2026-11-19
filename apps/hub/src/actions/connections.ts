'use server'

import gruentClient from '@gruent/hub/lib/gruent'
import { Connection } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import getAccessToken from '@gruent/hub/util/getAccessToken'

export const handleAddConnection = async (
  spaceId: string,
  name: string,
  category: string,
  attributes: Object,
) => {
  const accessToken = await getAccessToken()

  if (!accessToken)
    return {
      error: 'Your session is currently inactive. Sign in again to add the connection.',
    }

  const { errors } = await gruentClient(accessToken).connections.create(
    spaceId,
    name,
    category,
    attributes,
  )

  if (errors && errors.length > 0) return { error: errors[0] }

  revalidatePath('spaces/[spaceId]/connections', 'page')
  return { error: null }
}

export const handleUpdateConnection = async (
  spaceId: string,
  connectionId: string,
  connectionInput: Pick<Connection, 'name' | 'attributes'>,
) => {
  const accessToken = await getAccessToken()

  if (!accessToken)
    return {
      error: 'Your session is currently inactive. Sign in again to add the connection.',
    }

  const { errors } = await gruentClient(accessToken).connections.update(
    spaceId,
    connectionId,
    connectionInput,
  )

  if (errors && errors.length > 0) return { error: errors[0] }

  revalidatePath('spaces/[spaceId]/connections/[connectionId]', 'page')
  return { error: null }
}

export const handleDeleteConnection = async (spaceId: string, connectionId: string) => {
  const accessToken = await getAccessToken()

  if (!accessToken)
    return {
      error: 'Your session is currently inactive. Sign in again to delete the connection.',
    }

  const { errors } = await gruentClient(accessToken).connections.delete(spaceId, connectionId)

  if (errors && errors.length > 0) return { error: errors[0] }

  revalidatePath('spaces/[spaceId]/connections', 'page')
  return { error: null }
}

export const handleHealthcheckConnection = async (
  spaceId: string,
  connectionCategory: string,
  attributes: Record<string, any>,
) => {
  const accessToken = await getAccessToken()

  if (!accessToken)
    return {
      error: 'Your session is currently inactive. Sign in again to delete the connection.',
    }

  const { errors } = await gruentClient(accessToken).connections.healthcheck(
    spaceId,
    connectionCategory,
    attributes,
  )

  if (errors && errors.length > 0) return { error: errors[0] }

  return { error: null }
}
