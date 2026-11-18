'use client'

import { Button } from '@gruent/libs/frontend/components/core/button'
import { Field, FieldLabel } from '@gruent/libs/frontend/components/core/field'
import { Input } from '@gruent/libs/frontend/components/core/input'
import { addToast } from '@gruent/libs/frontend/hooks/useToast'
import { FC, FormEvent, useCallback, useMemo, useRef, useState } from 'react'
import MqttClient from '@gruent/hub/components/organisms/ConnectionFormPartials/MqttClient'
import HttpServer from '@gruent/hub/components/organisms/ConnectionFormPartials/HttpServer'
import MqttBroker from '@gruent/hub/components/organisms/ConnectionFormPartials/MqttBroker'
import {
  handleHealthcheckConnection,
  handleUpdateConnection,
} from '@gruent/hub/actions/connections'
import KafkaCluster from '@gruent/hub/components/organisms/ConnectionFormPartials/KafkaCluster'
import KafkaProducer from '@gruent/hub/components/organisms/ConnectionFormPartials/KafkaProducer'
import NatsServer from '@gruent/hub/components/organisms/ConnectionFormPartials/NatsServer'
import NatsClient from '@gruent/hub/components/organisms/ConnectionFormPartials/NatsClient'
import InfluxDbDatabase from '@gruent/hub/components/organisms/ConnectionFormPartials/InfluxDbDatabase'
import ClickhouseDatabase from '@gruent/hub/components/organisms/ConnectionFormPartials/ClickhouseDb'
import KafkaConsumer from '@gruent/hub/components/organisms/ConnectionFormPartials/KafkaConsumer'
import S3Bucket from '@gruent/hub/components/organisms/ConnectionFormPartials/S3Bucket'
import MinioBucket from '@gruent/hub/components/organisms/ConnectionFormPartials/MinioBucket'
import AwsSESEndpoint from '@gruent/hub/components/organisms/ConnectionFormPartials/AwsSesEndpoint'
import AwsSNSEndpoint from '@gruent/hub/components/organisms/ConnectionFormPartials/AwsSnsEndpoint'
import SendgridClient from '@gruent/hub/components/organisms/ConnectionFormPartials/SendgridClient'
import MonogoDbServer from '@gruent/hub/components/organisms/ConnectionFormPartials/MongoDbServer'
import { Connection } from '@prisma/client'

type Props = {
  orgId: string
  spaceId: string
  connection: Connection
  className?: string
  secrets: { name: string }[]
}

const ConnectionSettingsForm: FC<Props> = ({ orgId, spaceId, connection, className, secrets }) => {
  const formRef = useRef<HTMLFormElement>(null)

  const [name, setName] = useState(connection.name)
  const [currentCategoryFormData, setCurrentCategoryFormData] = useState<
    Map<string, string | number | string[] | number[]>
  >(new Map())

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    const formData = new FormData(formRef.current as HTMLFormElement)
    const name = formData.get('name') as string
    const attributes = Object.fromEntries(currentCategoryFormData.entries())

    const { error } = await handleUpdateConnection(spaceId, connection.id, {
      name,
      attributes,
    })

    if (error) {
      addToast({
        title: 'Could not update the connection',
        body: `The connection could not be updated: ${error}`,
        level: 'error',
      })
      return false

      // TODO: update form hints with invalid fields
    }

    addToast({
      title: 'Successfully updated connection',
      body: 'The changes should be reflected immediately.',
      level: 'success',
    })
    return true
  }

  const handleHealthcheck = useCallback(async () => {
    const attributes = Object.fromEntries(currentCategoryFormData.entries())
    const { error } = await handleHealthcheckConnection(
      spaceId,
      connection.connectionCategory,
      attributes,
    )

    if (error) {
      addToast({
        title: 'Healthcheck failed',
        body: error,
        level: 'warning',
      })
      return
    }

    addToast({
      title: 'Healthcheck successful',
      body: 'A test connection was established. Happy connecting!',
      level: 'success',
    })
  }, [currentCategoryFormData, spaceId, connection.connectionCategory])

  const secretOptions = useMemo(() => {
    return secrets.map((secret) => ({
      label: secret.name,
      value: secret.name,
    }))
  }, [secrets])

  const currentCategoryFormFields = useMemo(() => {
    switch (connection.connectionCategory) {
      case 'MQTT_CLIENT':
        return (
          <MqttClient
            orgId={orgId}
            spaceId={spaceId}
            setFormData={setCurrentCategoryFormData}
            initial={connection}
            secretOptions={secretOptions}
          />
        )
      case 'MQTT_BROKER':
        return <MqttBroker setFormData={setCurrentCategoryFormData} initial={connection} />
      case 'HTTP_SERVER':
        return <HttpServer setFormData={setCurrentCategoryFormData} initial={connection} />
      case 'KAFKA_CLUSTER':
        return <KafkaCluster setFormData={setCurrentCategoryFormData} initial={connection} />
      case 'KAFKA_PRODUCER':
        return (
          <KafkaProducer
            orgId={orgId}
            spaceId={spaceId}
            setFormData={setCurrentCategoryFormData}
            initial={connection}
          />
        )
      case 'KAFKA_CONSUMER':
        return (
          <KafkaConsumer
            spaceId={spaceId}
            setFormData={setCurrentCategoryFormData}
            initial={connection}
          />
        )
      case 'NATS_SERVER':
        return <NatsServer setFormData={setCurrentCategoryFormData} initial={connection} />
      case 'NATS_CLIENT':
        return (
          <NatsClient
            orgId={orgId}
            spaceId={spaceId}
            setFormData={setCurrentCategoryFormData}
            initial={connection}
          />
        )
      case 'INFLUXDB_DATABASE':
        return (
          <InfluxDbDatabase
            setFormData={setCurrentCategoryFormData}
            initial={connection}
            secretOptions={secretOptions}
          />
        )
      case 'CLICKHOUSE_DATABASE':
        return (
          <ClickhouseDatabase
            setFormData={setCurrentCategoryFormData}
            initial={connection}
            secretOptions={secretOptions}
          />
        )
      case 'S3_BUCKET':
        return (
          <S3Bucket
            setFormData={setCurrentCategoryFormData}
            initial={connection}
            secretOptions={secretOptions}
          />
        )
      case 'MINIO_BUCKET':
        return (
          <MinioBucket
            setFormData={setCurrentCategoryFormData}
            initial={connection}
            secretOptions={secretOptions}
          />
        )
      case 'AWS_SNS_ENDPOINT':
        return (
          <AwsSNSEndpoint
            setFormData={setCurrentCategoryFormData}
            initial={connection}
            secretOptions={secretOptions}
          />
        )
      case 'AWS_SES_ENDPOINT':
        return (
          <AwsSESEndpoint
            setFormData={setCurrentCategoryFormData}
            initial={connection}
            secretOptions={secretOptions}
          />
        )
      case 'SENDGRID_CLIENT':
        return (
          <SendgridClient
            setFormData={setCurrentCategoryFormData}
            initial={connection}
            secretOptions={secretOptions}
          />
        )
      case 'MONGODB_SERVER':
        return (
          <MonogoDbServer
            setFormData={setCurrentCategoryFormData}
            initial={connection}
            secretOptions={secretOptions}
          />
        )
      default:
        return
    }
  }, [connection, spaceId, orgId, secretOptions])

  const showHealthcheckButton = useMemo(() => {
    switch (connection.connectionCategory) {
      case 'MQTT_CLIENT':
      case 'KAFKA_PRODUCER':
      case 'KAFKA_CONSUMER':
      case 'NATS_CLIENT':
        return false
      default:
        return true
    }
  }, [connection.connectionCategory])

  return (
    <div className={className}>
      <form ref={formRef} onSubmit={(e) => handleSubmit(e)}>
        <Field className="mt-4 mb-2">
          <FieldLabel htmlFor="name">Name</FieldLabel>
          <Input
            id="name"
            name="name"
            placeholder="Name of the connection"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </Field>
        <Field className="mt-4 mb-2">
          <FieldLabel htmlFor="category">Category</FieldLabel>
          <Input
            id="category"
            name="category"
            value={connection.connectionCategory}
            autoComplete="off"
            spellCheck={false}
            readOnly
          />
        </Field>
        {currentCategoryFormFields}
        <div className="flex gap-2">
          <Button type="submit">Update</Button>
          {showHealthcheckButton && (
            <Button variant="secondary" onClick={handleHealthcheck}>
              Test
            </Button>
          )}
        </div>
      </form>
    </div>
  )
}

export default ConnectionSettingsForm
