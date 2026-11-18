import useChannelEditorStore from '@gruent/hub/stores/channelEditorStore'
import { ChannelNode, MqttSourceNodeConfig } from '@gruent/libs/legacy/engine/nodes/v1'
import { Thing } from '@prisma/client'
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
  things: Thing[]
  orgId: string
  spaceId: string
}

const MqttSourceOptions: FC<Props> = ({ things }) => {
  const upsertNode = useChannelEditorStore((state) => state.upsertNode)
  const currentNode = useChannelEditorStore(
    (state) => state.currentNode as ChannelNode<MqttSourceNodeConfig>,
  )

  const [selectedMqttClient, setSelectedMqttClient] = useState<Thing>()
  const [qos, setQos] = useState<string>()
  const [topic, setTopic] = useState<string>()

  // load in default values
  useEffect(() => {
    const currentConfig = { ...currentNode.metadata.config }
    if (!things) return

    const thing = things.find((thing) => {
      if (thing.id === currentConfig['mqttClient::thing']) return true
      return false
    })

    setSelectedMqttClient(thing)
    setQos(currentConfig.qos.toString() || '0')
    setTopic(currentConfig.topic || '')
  }, [currentNode, things])

  const mqttClients = useMemo(() => {
    if (!things) return []

    return things.filter((thing) => {
      if (thing.thingCategory == 'MQTT_CLIENT') return true
      return false
    })
  }, [things])

  // update config and dependencies when options have been updated
  useEffect(() => {
    if (!upsertNode) return
    if (!selectedMqttClient) return
    if (!qos) return
    if (!topic) return

    // update config
    const updatedNode = structuredClone(currentNode)
    updatedNode.metadata.config = {
      'mqttClient::thing': selectedMqttClient.id,
      qos: parseInt(qos) as 0 | 1 | 2,
      topic,
    }

    // update dependencies array
    let mqttClientThingDependencyIndex = updatedNode.metadata.dependencies.things.findIndex(
      (d) => d.fieldName && d.fieldName === 'mqttClient::thing',
    )
    if (mqttClientThingDependencyIndex < 0)
      mqttClientThingDependencyIndex = updatedNode.metadata.dependencies.things.length

    updatedNode.metadata.dependencies.things[mqttClientThingDependencyIndex] = {
      fieldName: 'mqttClient::thing',
      internal: false,
      thingId: selectedMqttClient.id,
    }

    upsertNode(currentNode.id, updatedNode)

    // eslint-disable-next-line -- currentNode in the dependencies array causes node configs to sometimes be copied
  }, [upsertNode, selectedMqttClient, qos, topic])

  const mqttClientOptions = useMemo(() => {
    return mqttClients.map((mqttClient) => ({
      label: mqttClient.name,
      value: mqttClient.id,
    }))
  }, [mqttClients])

  if (!mqttClients || mqttClients.length <= 0)
    return (
      <p className="mb-2">
        <Button variant="link" onClick={() => openModal('createThing')}>
          Add an MQTT client
        </Button>{' '}
        to your space before using this node.
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
          aria-label="Create MQTT client"
          className="my-3"
          onClick={() => openModal('createThing')}
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
        <Select name="qos" value={qos ?? '0'} onValueChange={(value) => setQos(value)}>
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

export default MqttSourceOptions
