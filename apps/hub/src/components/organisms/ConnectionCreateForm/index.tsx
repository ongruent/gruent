'use client'

import { Button } from '@gruent/libs/frontend/components/core/button'
import { Field, FieldLabel } from '@gruent/libs/frontend/components/core/field'
import { Input } from '@gruent/libs/frontend/components/core/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@gruent/libs/frontend/components/core/select'
import { Textarea } from '@gruent/libs/frontend/components/core/textarea'
import { ConnectionCategoryOptions } from '@gruent/hub/components/modals/CreateConnectionModal'
import { addToast } from '@gruent/libs/frontend/hooks/useToast'
import { useSearchParams } from 'next/navigation'
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'
import MqttClient from '../ConnectionFormPartials/MqttClient'
import HttpServer from '../ConnectionFormPartials/HttpServer'
import MqttBroker from '../ConnectionFormPartials/MqttBroker'
import { handleAddConnection, handleHealthcheckConnection } from '@gruent/hub/actions/connections'
import KafkaCluster from '../ConnectionFormPartials/KafkaCluster'
import KafkaProducer from '../ConnectionFormPartials/KafkaProducer'
import NatsServer from '../ConnectionFormPartials/NatsServer'
import NatsClient from '../ConnectionFormPartials/NatsClient'
import InfluxDbDatabase from '../ConnectionFormPartials/InfluxDbDatabase'
import ClickhouseDatabase from '../ConnectionFormPartials/ClickhouseDb'
import KafkaConsumer from '../ConnectionFormPartials/KafkaConsumer'
import S3Bucket from '../ConnectionFormPartials/S3Bucket'
import MinioBucket from '../ConnectionFormPartials/MinioBucket'
import AwsSESEndpoint from '../ConnectionFormPartials/AwsSesEndpoint'
import AwsSNSEndpoint from '../ConnectionFormPartials/AwsSnsEndpoint'
import SendgridClient from '../ConnectionFormPartials/SendgridClient'
import MongoDbServer from '../ConnectionFormPartials/MongoDbServer'
import PostgresServer from '../ConnectionFormPartials/PostgresServer'

type Props = {
  orgId: string
  spaceId: string
  secrets: { name: string }[]
  name?: string
  category?: string
  attributes?: Map<string, any>
  hideSubmit?: boolean
  importMode?: boolean
}

type ConnectionImport = {
  name: string
  category: string
  attributes: Record<string, any>
}

const CreateConnectionForm = forwardRef(
  (
    {
      orgId,
      spaceId,
      secrets,
      name: initialName,
      category: initialCategory,
      attributes: initialAttributes,
      importMode: initialImportMode = false,
      hideSubmit = false,
    }: Props,
    ref,
  ) => {
    const formRef = useRef<HTMLFormElement>(null)

    const searchParams = useSearchParams()

    const [importMode, setImportMode] = useState<Boolean>(initialImportMode)

    const [name, setName] = useState(initialName || (searchParams.get('name') ?? ''))
    const [category, setCategory] = useState(
      initialCategory || (searchParams.get('category') ?? ''),
    )
    const [currentCategoryFormData, setCurrentCategoryFormData] = useState<
      Map<string, string | number | string[] | number[]>
    >(initialAttributes || new Map())

    const [connectionJson, setConnectionJson] = useState<string>()
    const [connectionImportError, setConnectionImportError] = useState<string>()

    const connectionImport = useMemo<ConnectionImport | null>(() => {
      try {
        if (!connectionJson) return null

        const connectionImport = JSON.parse(connectionJson)

        if (!connectionImport.name) {
          setConnectionImportError('name is required')
          return null
        }
        if (!connectionImport.category) {
          setConnectionImportError('category is required')
          return null
        }
        if (!connectionImport.attributes) {
          setConnectionImportError('attributes are required')
          return null
        }

        setConnectionImportError(undefined)

        return connectionImport as ConnectionImport
      } catch (_err) {
        setConnectionImportError('could not parse import object')
        return null
      }
    }, [connectionJson])

    useEffect(() => {
      if (connectionImport && !connectionImportError) {
        setName(connectionImport.name)
        setCategory(connectionImport.category)
        setCurrentCategoryFormData(new Map(Object.entries(connectionImport.attributes)))
      }
    }, [connectionImport, connectionImportError])

    const handleSubmit = useCallback(async () => {
      if (!formRef.current) return { error: 'Form element not found' }

      const formData = new FormData(formRef.current as HTMLFormElement)
      const name = formData.get('name') as string
      const category = formData.get('category') as string
      const attributes = Object.fromEntries(currentCategoryFormData.entries())

      const { error } = await handleAddConnection(spaceId, name, category, attributes)

      if (error) {
        addToast({
          title: 'Could not create the connection',
          body: `The connection could not be created: ${error}`,
          level: 'error',
        })
        return { error: error }

        // TODO: update form hints with invalid fields
      }

      addToast({
        title: 'Successfully added connection to space',
        body: 'Successfully added connection to space.',
        level: 'success',
      })
      return { error: null }
    }, [formRef, currentCategoryFormData, spaceId])

    useImperativeHandle(ref, () => ({
      handleSubmit,
    }))

    const handleHealthcheck = useCallback(async () => {
      const attributes = Object.fromEntries(currentCategoryFormData.entries())
      const { error } = await handleHealthcheckConnection(spaceId, category, attributes)

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
    }, [currentCategoryFormData, spaceId, category])

    const secretOptions = useMemo(() => {
      return secrets.map((secret) => ({
        label: secret.name,
        value: secret.name,
      }))
    }, [secrets])

    // If initialAttributes were passed in, create an initialConnection object
    const initialConnection = useMemo(() => {
      if (!initialAttributes) return undefined

      return {
        attributes: Object.fromEntries(initialAttributes.entries()),
      }
    }, [initialAttributes])

    const currentCategoryFormFields = useMemo(() => {
      switch (category) {
        case 'MQTT_CLIENT':
          return (
            <MqttClient
              orgId={orgId}
              spaceId={spaceId}
              setFormData={setCurrentCategoryFormData}
              secretOptions={secretOptions}
              initial={initialConnection}
            />
          )
        case 'MQTT_BROKER':
          return <MqttBroker setFormData={setCurrentCategoryFormData} initial={initialConnection} />
        case 'HTTP_SERVER':
          return <HttpServer setFormData={setCurrentCategoryFormData} initial={initialConnection} />
        case 'KAFKA_CLUSTER':
          return (
            <KafkaCluster setFormData={setCurrentCategoryFormData} initial={initialConnection} />
          )
        case 'KAFKA_PRODUCER':
          return (
            <KafkaProducer
              orgId={orgId}
              spaceId={spaceId}
              setFormData={setCurrentCategoryFormData}
              initial={initialConnection}
            />
          )
        case 'KAFKA_CONSUMER':
          return (
            <KafkaConsumer
              spaceId={spaceId}
              setFormData={setCurrentCategoryFormData}
              initial={initialConnection}
            />
          )
        case 'NATS_SERVER':
          return <NatsServer setFormData={setCurrentCategoryFormData} initial={initialConnection} />
        case 'NATS_CLIENT':
          return (
            <NatsClient
              orgId={orgId}
              spaceId={spaceId}
              setFormData={setCurrentCategoryFormData}
              initial={initialConnection}
            />
          )
        case 'INFLUXDB_DATABASE':
          return (
            <InfluxDbDatabase
              setFormData={setCurrentCategoryFormData}
              secretOptions={secretOptions}
              initial={initialConnection}
            />
          )
        case 'CLICKHOUSE_DATABASE':
          return (
            <ClickhouseDatabase
              setFormData={setCurrentCategoryFormData}
              secretOptions={secretOptions}
              initial={initialConnection}
            />
          )
        case 'S3_BUCKET':
          return (
            <S3Bucket
              setFormData={setCurrentCategoryFormData}
              secretOptions={secretOptions}
              initial={initialConnection}
            />
          )
        case 'MINIO_BUCKET':
          return (
            <MinioBucket
              setFormData={setCurrentCategoryFormData}
              secretOptions={secretOptions}
              initial={initialConnection}
            />
          )
        case 'AWS_SNS_ENDPOINT':
          return (
            <AwsSNSEndpoint
              setFormData={setCurrentCategoryFormData}
              secretOptions={secretOptions}
              initial={initialConnection}
            />
          )
        case 'AWS_SES_ENDPOINT':
          return (
            <AwsSESEndpoint
              setFormData={setCurrentCategoryFormData}
              secretOptions={secretOptions}
              initial={initialConnection}
            />
          )
        case 'SENDGRID_CLIENT':
          return (
            <SendgridClient
              setFormData={setCurrentCategoryFormData}
              secretOptions={secretOptions}
              initial={initialConnection}
            />
          )
        case 'MONGODB_SERVER':
          return (
            <MongoDbServer
              setFormData={setCurrentCategoryFormData}
              secretOptions={secretOptions}
              initial={initialConnection}
            />
          )
        case 'POSTGRES_SERVER':
          return (
            <PostgresServer
              setFormData={setCurrentCategoryFormData}
              secretOptions={secretOptions}
              initial={initialConnection}
            />
          )
        default:
          return
      }
    }, [category, orgId, spaceId, secretOptions, initialConnection])

    const showHealthcheckButton = useMemo(() => {
      switch (category) {
        case 'MQTT_CLIENT':
        case 'KAFKA_PRODUCER':
        case 'KAFKA_CONSUMER':
        case 'NATS_CLIENT':
          return false
        default:
          return true
      }
    }, [category])

    return (
      <>
        {importMode && (
          <section className="mb-8">
            <Field className="my-3">
              <FieldLabel htmlFor="connectionJson">Import object</FieldLabel>
              <Textarea
                id="connectionJson"
                name="connectionJson"
                value={connectionJson}
                onChange={(e) => setConnectionJson(e.target.value)}
                className="h-40"
              />
            </Field>
            {connectionImportError && (
              <p className="text-red-400">
                Invalid connection import object: {connectionImportError}
              </p>
            )}
          </section>
        )}
        {(!importMode || (importMode && connectionImport)) && (
          <section
            className="relative bg-gray-50 rounded-sm py-5 px-10 border border-gray-200 dark:bg-gray-900 dark:border-gray-700"
            style={{ boxShadow: '3px 3px 10px 0 rgba(0, 0, 0, 0.03)' }}
          >
            <form
              ref={formRef}
              onSubmit={(e) => {
                e.preventDefault()
                handleSubmit()
              }}
            >
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
                <Select
                  name="category"
                  value={category ?? ''}
                  onValueChange={(value) => setCategory(value)}
                >
                  <SelectTrigger id="category" className="w-full">
                    <SelectValue placeholder="Select an option" />
                  </SelectTrigger>
                  <SelectContent>
                    {ConnectionCategoryOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              {currentCategoryFormFields}
              <div className="flex gap-2">
                {!hideSubmit && <Button type="submit">Create</Button>}
                {showHealthcheckButton && (
                  <Button variant="secondary" onClick={handleHealthcheck}>
                    Test
                  </Button>
                )}
              </div>
            </form>
          </section>
        )}
        <div className="flex justify-end">
          <Button variant="link" onClick={() => setImportMode(!importMode)}>
            {importMode ? 'Create mode' : 'Import mode'}
          </Button>
        </div>
      </>
    )
  },
)

CreateConnectionForm.displayName = 'CreateConnectionForm'

export default CreateConnectionForm
