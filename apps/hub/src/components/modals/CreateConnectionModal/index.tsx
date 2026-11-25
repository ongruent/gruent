'use client'

import { FC, useCallback, useEffect, useRef } from 'react'
import Modal from '@gruent/libs/frontend/components/Modal'
import { useQuery } from '@tanstack/react-query'
import gruentClient from '@gruent/hub/lib/gruent'
import { addToast } from '@gruent/libs/frontend/hooks/useToast'
import CreateConnectionForm from '../../organisms/ConnectionCreateForm'
import useAuth from '@gruent/hub/hooks/useAuth'

export const ConnectionCategoryOptions = [
  {
    value: 'MQTT_BROKER',
    label: 'MQTT Broker',
  },
  {
    value: 'MQTT_CLIENT',
    label: 'MQTT Client',
  },
  {
    value: 'HTTP_SERVER',
    label: 'HTTP Server',
  },
  {
    value: 'KAFKA_CLUSTER',
    label: 'Kafka Cluster',
  },
  {
    value: 'KAFKA_PRODUCER',
    label: 'Kafka Producer',
  },
  {
    value: 'KAFKA_CONSUMER',
    label: 'Kafka Consumer',
  },
  {
    value: 'NATS_SERVER',
    label: 'NATS Server',
  },
  {
    value: 'NATS_CLIENT',
    label: 'NATS Client',
  },
  {
    value: 'INFLUXDB_DATABASE',
    label: 'InfluxDB Database',
  },
  {
    value: 'CLICKHOUSE_DATABASE',
    label: 'ClickHouse Database',
  },
  {
    value: 'S3_BUCKET',
    label: 'S3 Bucket',
  },
  {
    value: 'MINIO_BUCKET',
    label: 'Minio Bucket',
  },
  {
    value: 'AWS_SNS_ENDPOINT',
    label: 'AWS SNS',
  },
  {
    value: 'AWS_SES_ENDPOINT',
    label: 'AWS SES',
  },
  {
    value: 'SENDGRID_CLIENT',
    label: 'Sendgrid Client',
  },
  {
    value: 'MONGODB_SERVER',
    label: 'MongoDB Server',
  },
  {
    value: 'POSTGRES_SERVER',
    label: 'PostgreSQL Server',
  },
]

type Props = {
  orgId: string
  spaceId: string
  onClose?: () => void
  onSubmit?: () => void
}

const CreateConnectionModal: FC<Props> = ({ orgId, spaceId, onClose, onSubmit }) => {
  const formRef = useRef<HTMLFormElement>(null)

  const { accessToken } = useAuth()

  const { data: secrets, error: secretsError } = useQuery({
    queryKey: ['secrets'],
    queryFn: async () => {
      if (!accessToken) throw new Error('Current session is not active')

      const { data: secrets, errors } = await gruentClient(accessToken).secrets.list(spaceId)

      if (errors && errors.length > 0) throw new Error(errors[0])

      return secrets
    },
  })

  const handleAccept = useCallback(() => {
    const { error } = formRef.current?.handleSubmit()

    if (!error) {
      if (onSubmit) onSubmit()
    }
  }, [formRef, onSubmit])

  useEffect(() => {
    if (secretsError) {
      addToast({
        title: 'Could not retrieve secrets',
        body: secretsError[0],
        level: 'error',
      })
    }
  }, [secretsError])

  return (
    <Modal
      id="createConnection"
      title="Create a connection"
      acceptText="Create"
      onAccept={handleAccept}
      onClose={onClose}
    >
      <h2>Create a connection</h2>
      <p className="text-gray-500 mb-2">
        <small>Create a connection to use in the channel editor.</small>
      </p>
      <div className="relative">
        <CreateConnectionForm
          orgId={orgId}
          spaceId={spaceId}
          secrets={secrets ?? []}
          ref={formRef}
          hideSubmit
        />
      </div>
    </Modal>
  )
}

export default CreateConnectionModal
