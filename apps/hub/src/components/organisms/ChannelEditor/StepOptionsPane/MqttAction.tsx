import useChannelEditorStore from '@gruent/hub/stores/channelEditorStore'
import { ChannelNode } from '@gruent/libs/legacy/engine/nodes/v1'
import { MqttActionNodeConfig } from '@gruent/libs/engine/nodes/v1/src/action/mqtt'
import { Connection } from '@prisma/client'
import { FC, useEffect, useMemo, useState } from 'react'
import { openModal } from '@gruent/libs/frontend/hooks/useModal'
import { PlusIcon } from 'lucide-react'
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

type Props = {
  connections: Connection[]
  orgId: string
  spaceId: string
}

const MqttActionOptions: FC<Props> = ({ connections }) => {
  const upsertStep = useChannelEditorStore((state) => state.upsertStep)
  const currentStep = useChannelEditorStore(
    (state) => state.currentStep as ChannelNode<MqttActionNodeConfig>,
  )

  const [selectedMqttClient, setSelectedMqttClient] = useState<Connection>()
  const [qos, setQos] = useState<string>()
  const [topic, setTopic] = useState<string>()

  // load in default values
  useEffect(() => {
    const currentConfig = { ...currentStep.metadata.config }
    if (!connections) return

    const connection = connections.find((connection) => {
      if (connection.id === currentConfig['mqttClient::thing']) return true
      return false
    })

    setSelectedMqttClient(connection)
    setQos(currentConfig.qos.toString() || '0')
    setTopic(currentConfig.topic || '')
  }, [currentStep, connections])

  const mqttClients = useMemo(() => {
    if (!connections) return []

    return connections.filter((connection) => {
      if (connection.connectionCategory == 'MQTT_CLIENT') return true
      return false
    })
  }, [connections])

  // update config and dependencies when options have been updated
  useEffect(() => {
    if (!selectedMqttClient) return
    if (!qos) return
    if (!topic) return

    // update config
    const updatedStep = structuredClone(currentStep)
    updatedStep.metadata.config = {
      'mqttClient::thing': selectedMqttClient.id,
      qos: parseInt(qos) as 0 | 1 | 2,
      topic,
    }

    // update dependencies array
    let mqttClientConnectionDependencyIndex = updatedStep.metadata.dependencies.things.findIndex(
      (d) => d.fieldName && d.fieldName === 'mqttClient::thing',
    )
    if (mqttClientConnectionDependencyIndex < 0)
      mqttClientConnectionDependencyIndex = updatedStep.metadata.dependencies.things.length

    updatedStep.metadata.dependencies.things[mqttClientConnectionDependencyIndex] = {
      fieldName: 'mqttClient::thing',
      internal: false,
      thingId: selectedMqttClient.id,
    }

    upsertStep(currentStep.id, updatedStep)

    // eslint-disable-next-line -- currentStep in the dependencies array causes step configs to sometimes be copied
  }, [selectedMqttClient, qos, topic, upsertStep])

  const mqttClientOptions = useMemo(() => {
    return mqttClients.map((mqttClient) => ({
      label: mqttClient.name,
      value: mqttClient.id,
    }))
  }, [mqttClients])

  if (!mqttClients || mqttClients.length <= 0)
    return (
      <p className="mb-2">
        <Button variant="link" onClick={() => openModal('createConnection')}>
          Add an MQTT client
        </Button>{' '}
        to your space before using this step.
      </p>
    )

  return (
    <>
      <div className="flex flex-row items-end gap-2">
        <Field className="my-3 grow">
          <FieldLabel htmlFor="mqttClient::thing">MQTT Client</FieldLabel>
          <Select
            name="mqttClient::thing"
            value={selectedMqttClient?.id ?? ''}
            onValueChange={(value) =>
              setSelectedMqttClient(
                mqttClients.find((c) => {
                  if (c.id === value) return true
                  return false
                }),
              )
            }
          >
            <SelectTrigger id="mqttClient::thing" className="w-full">
              <SelectValue placeholder="Select an option" />
            </SelectTrigger>
            <SelectContent>
              {mqttClientOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Button
          size="icon"
          aria-label="Create connection"
          className="my-3"
          onClick={() => openModal('createConnection')}
        >
          <PlusIcon />
        </Button>
      </div>
      <Field className="my-3">
        <FieldLabel htmlFor="topic">Topic</FieldLabel>
        <Input
          id="topic"
          name="topic"
          value={topic ?? ''}
          onChange={(e) => setTopic(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
      </Field>
      <Field className="my-3">
        <FieldLabel htmlFor="qos">QoS</FieldLabel>
        <Select name="qos" value={qos?.toString() ?? '0'} onValueChange={(value) => setQos(value)}>
          <SelectTrigger id="qos" className="w-full">
            <SelectValue placeholder="Select an option" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="0">0 - At most once</SelectItem>
            <SelectItem value="1">1 - At least once</SelectItem>
            <SelectItem value="2">2 - Exactly once</SelectItem>
          </SelectContent>
        </Select>
      </Field>
    </>
  )
}

export default MqttActionOptions
