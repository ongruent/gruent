'use client'

import { Field, FieldLabel } from '@gruent/libs/frontend/components/core/field'
import { Input } from '@gruent/libs/frontend/components/core/input'
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
  initial?: Partial<Connection>
}

const KafkaConsumer: FC<Props> = ({ setFormData, spaceId, initial }) => {
  const attributes = useMemo(() => {
    if (initial && initial.attributes && typeof initial.attributes === 'string')
      return JSON.parse(initial.attributes)

    if (initial && initial.attributes && typeof initial.attributes === 'object')
      return initial.attributes

    return undefined
  }, [initial])

  const [clusterId, setClusterId] = useState<string>(attributes?.cluster)
  const [groupId, setGroupId] = useState<string>(attributes?.groupId)
  const [autoOffsetReset, setAutoOffsetReset] = useState<'latest' | 'earliest' | 'none'>(
    attributes?.autoOffsetReset ?? 'earliest',
  )

  const { accessToken } = useAuth()

  const {
    status: getKafkaClustersStatus,
    data: kafkaClusters,
    error: getKafkaClustersError,
  } = useQuery({
    queryKey: ['connections', 'kafkaClusters', spaceId],
    queryFn: async () => {
      if (!accessToken) throw new Error('Invalid auth session.')

      const { data: connections, errors } = await gruentClient(accessToken).connections.list(
        spaceId,
        {
          category: 'KAFKA_CLUSTER',
        },
      )

      if (errors && errors.length > 0) throw new Error(errors[0])

      return connections
    },
  })

  const kafkaClusterOptions = useMemo(() => {
    if (getKafkaClustersError) return []
    if (getKafkaClustersStatus !== 'success') return []
    if (!kafkaClusters) return []

    return kafkaClusters.map((kafkaCluster) => {
      return {
        label: kafkaCluster.name,
        value: kafkaCluster.id,
      }
    })
  }, [kafkaClusters, getKafkaClustersError, getKafkaClustersStatus])

  useEffect(() => {
    const updatedFormData = new Map()
    updatedFormData.set('cluster', clusterId)
    updatedFormData.set('groupId', groupId)
    updatedFormData.set('autoOffsetReset', autoOffsetReset)
    setFormData(updatedFormData)
  }, [clusterId, groupId, autoOffsetReset, setFormData])

  if (!kafkaClusters || getKafkaClustersStatus !== 'success') return

  if (kafkaClusters.length <= 0) {
    return (
      <p>
        No Kafka clusters were found in this space. You'll have to&nbsp;
        <span className="text-blue-600" onClick={() => openModal('createConnection')}>
          create an Kafka cluster
        </span>
        &nbsp;in this space before creating an Kafka consumer.
      </p>
    )
  }

  return (
    <>
      <Field className="mt-4 mb-2">
        <FieldLabel htmlFor="cluster">Cluster</FieldLabel>
        <Select
          name="cluster"
          value={clusterId ?? ''}
          onValueChange={(value) => setClusterId(value)}
        >
          <SelectTrigger id="cluster" className="w-full">
            <SelectValue placeholder="Select an option" />
          </SelectTrigger>
          <SelectContent>
            {kafkaClusterOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field className="mt-4 mb-2">
        <FieldLabel htmlFor="groupId">Group ID</FieldLabel>
        <Input
          id="groupId"
          name="groupId"
          value={groupId}
          onChange={(e) => setGroupId(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
      </Field>
      <Field className="mt-4 mb-2">
        <FieldLabel htmlFor="autoOffsetReset">Auto Offset Reset</FieldLabel>
        <Select
          name="autoOffsetReset"
          value={autoOffsetReset ?? ''}
          onValueChange={(value) => setAutoOffsetReset(value as 'latest' | 'earliest' | 'none')}
        >
          <SelectTrigger id="autoOffsetReset" className="w-full">
            <SelectValue placeholder="Select an option" />
          </SelectTrigger>
          <SelectContent>
            {[
              {
                label: 'latest',
                value: 'latest',
              },
              {
                label: 'earliest',
                value: 'earliest',
              },
              {
                label: 'none',
                value: 'none',
              },
            ].map((option) => (
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

export default KafkaConsumer
