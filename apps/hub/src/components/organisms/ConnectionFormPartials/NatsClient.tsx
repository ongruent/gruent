'use client'

import { Button } from '@gruent/libs/frontend/components/core/button'
import { Field, FieldLabel } from '@gruent/libs/frontend/components/core/field'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@gruent/libs/frontend/components/core/select'
import useAuth from '@gruent/hub/hooks/useAuth'
import gruentClient from '@gruent/hub/lib/gruent'
import { openModal } from '@gruent/libs/frontend/hooks/useModal'
import { Connection } from '@prisma/client'
import { useQuery } from '@tanstack/react-query'
import { Dispatch, FC, useEffect, useMemo, useState } from 'react'

type Props = {
  setFormData: Dispatch<Map<string, string | number | string[] | number[]>>
  spaceId: string
  orgId: string
  initial?: Partial<Connection>
}

const NatsClient: FC<Props> = ({ setFormData, spaceId, initial }) => {
  const attributes = useMemo(() => {
    if (initial && initial.attributes && typeof initial.attributes === 'string')
      return JSON.parse(initial.attributes)

    if (initial && initial.attributes && typeof initial.attributes === 'object')
      return initial.attributes

    return undefined
  }, [initial])

  const [server, setServer] = useState<string>(attributes?.server)

  const { accessToken } = useAuth()

  const {
    status: getNatsServersStatus,
    data: natsServers,
    error: getNatsServersError,
  } = useQuery({
    queryKey: ['connections', 'natsServers', spaceId],
    queryFn: async () => {
      if (!accessToken) throw new Error('Invalid auth session.')

      const { data: connections, errors } = await gruentClient(accessToken).connections.list(
        spaceId,
        {
          category: 'NATS_SERVER',
        },
      )

      if (errors && errors.length > 0) throw new Error(errors[0])

      return connections
    },
  })

  const natsServerOptions = useMemo(() => {
    if (getNatsServersError) return []
    if (getNatsServersStatus !== 'success') return []
    if (!natsServers) return []

    return natsServers.map((connection) => {
      return {
        label: connection.name,
        value: connection.id,
      }
    })
  }, [natsServers, getNatsServersError, getNatsServersStatus])

  useEffect(() => {
    const updatedFormData = new Map()
    updatedFormData.set('server', server)
    setFormData(updatedFormData)
  }, [server, setFormData])

  if (!natsServers || getNatsServersStatus !== 'success') return

  if (natsServers.length <= 0) {
    return (
      <p>
        No NATS servers were found in this space. You'll have to&nbsp;
        <Button variant="link" onClick={() => openModal('createConnection')}>
          create a NATS server
        </Button>
        &nbsp;in this space before creating a NATS client.
      </p>
    )
  }

  return (
    <>
      <Field className="mt-4 mb-2">
        <FieldLabel htmlFor="server">Server</FieldLabel>
        <Select name="server" value={server ?? ''} onValueChange={(value) => setServer(value)}>
          <SelectTrigger id="server" className="w-full">
            <SelectValue placeholder="Select an option" />
          </SelectTrigger>
          <SelectContent>
            {natsServerOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
    </>
  )
}

export default NatsClient
