import useChannelEditorStore from '@gruent/hub/stores/channelEditorStore'
import { ChannelNode } from '@gruent/libs/legacy/engine/nodes/v1'
import { MessageQueueActionNodeConfig } from '@gruent/libs/engine/nodes/v1/src/action/messageQueue'
import { Connection } from '@prisma/client'
import { FC, useEffect, useMemo, useState } from 'react'
import KafkaActionOptions from './KafkaActionOptions'
import NatsActionOptions from './NatsActionOptions'
import { openModal } from '@gruent/libs/frontend/hooks/useModal'
import { PlusIcon } from 'lucide-react'
import { Button } from '@gruent/libs/frontend/components/core/button'
import { Field, FieldLabel } from '@gruent/libs/frontend/components/core/field'
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

export enum MessageQueue {
  Kafka = 'Kafka',
  NATS = 'NATS',
}

const MessageQueueActionOptions: FC<Props> = ({ connections, orgId, spaceId }) => {
  const currentStep = useChannelEditorStore(
    (state) => state.currentStep as ChannelNode<MessageQueueActionNodeConfig>,
  )

  const [selectedMessageQueueClient, setSelectedMessageQueueClient] = useState<Connection>()

  // load in the default message queue client from the current step config
  useEffect(() => {
    const currentConfig = { ...currentStep.metadata.config }
    if (!connections) return

    if (Object.keys(currentConfig).includes('kafkaProducer::thing')) {
      const kafkaProducer = connections.find((s) => {
        if (s.id === currentConfig['kafkaProducer::thing']) return true
        return false
      })
      if (kafkaProducer) setSelectedMessageQueueClient(kafkaProducer)
      return
    }

    if (Object.keys(currentConfig).includes('natsClient::thing')) {
      const natsClient = connections.find((s) => {
        if (s.id === currentConfig['natsClient::thing']) return true
        return false
      })
      if (natsClient) setSelectedMessageQueueClient(natsClient)
      return
    }
  }, [currentStep, connections])

  const selectedMessageQueueType = useMemo(() => {
    if (!selectedMessageQueueClient) return

    if (selectedMessageQueueClient.connectionCategory === 'KAFKA_PRODUCER')
      return MessageQueue.Kafka

    if (selectedMessageQueueClient.connectionCategory === 'NATS_CLIENT') return MessageQueue.NATS
  }, [selectedMessageQueueClient])

  const messageQueueClients = useMemo(() => {
    if (!connections) return []

    const kafkaProducers = connections.filter((connection) => {
      if (connection.connectionCategory == 'KAFKA_PRODUCER') return true
      return false
    })

    const natsClients = connections.filter((connection) => {
      if (connection.connectionCategory == 'NATS_CLIENT') return true
      return false
    })

    return [...kafkaProducers, ...natsClients]
  }, [connections])

  const messageQueueClientOptions = useMemo(() => {
    return messageQueueClients.map((connection) => ({
      label: connection.name,
      value: connection.id,
    }))
  }, [messageQueueClients])

  const selectedSubnodeOptions = useMemo(() => {
    if (!selectedMessageQueueType) return

    switch (selectedMessageQueueType) {
      case MessageQueue.Kafka:
        return (
          <KafkaActionOptions
            connections={connections}
            orgId={orgId}
            spaceId={spaceId}
            messageQueueClientOptions={messageQueueClientOptions}
            selectedMessageQueueClient={selectedMessageQueueClient}
          />
        )
      case MessageQueue.NATS:
        return (
          <NatsActionOptions
            connections={connections}
            orgId={orgId}
            spaceId={spaceId}
            messageQueueClientOptions={messageQueueClientOptions}
            selectedMessageQueueClient={selectedMessageQueueClient}
          />
        )
    }
  }, [
    selectedMessageQueueType,
    messageQueueClientOptions,
    selectedMessageQueueClient,
    orgId,
    spaceId,
    connections,
  ])

  if (!messageQueueClients || messageQueueClients.length <= 0)
    return (
      <p className="mb-2">
        <Button variant="link" className="mr-1" onClick={() => openModal('createConnection')}>
          Add a message queue client
        </Button>
        to your space before using this step.
      </p>
    )

  return (
    <>
      <div className="flex flex-row items-end gap-2">
        <Field className="my-3 grow">
          <FieldLabel htmlFor="messageQueueClient">Message Queue Client</FieldLabel>
          <Select
            name="messageQueueClient"
            value={selectedMessageQueueClient?.id ?? ''}
            onValueChange={(value) =>
              setSelectedMessageQueueClient(
                messageQueueClients.find((s) => {
                  if (s.id === value) return true
                  return false
                }),
              )
            }
          >
            <SelectTrigger id="messageQueueClient" className="w-full">
              <SelectValue placeholder="Select an option" />
            </SelectTrigger>
            <SelectContent>
              {messageQueueClientOptions.map((option) => (
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
      {selectedSubnodeOptions}
    </>
  )
}

export default MessageQueueActionOptions
