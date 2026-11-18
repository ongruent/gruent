import useChannelEditorStore from '@gruent/hub/stores/channelEditorStore'
import { ChannelNode } from '@gruent/libs/legacy/engine/nodes/v1'
import { MessageQueueActionNodeConfig } from '@gruent/libs/engine/nodes/v1/src/action/messageQueue'
import { Connection } from '@prisma/client'
import { FC, useEffect, useState } from 'react'
import { openModal } from '@gruent/libs/frontend/hooks/useModal'
import { Button } from '@gruent/libs/frontend/components/core/button'
import { Field, FieldLabel } from '@gruent/libs/frontend/components/core/field'
import { Input } from '@gruent/libs/frontend/components/core/input'

type Props = {
  connections: Connection[]
  orgId: string
  spaceId: string
  messageQueueClientOptions: {
    label: string
    value: string
  }[]
  selectedMessageQueueClient?: Connection
}

const KafkaActionOptions: FC<Props> = ({
  connections,
  messageQueueClientOptions,
  selectedMessageQueueClient,
}) => {
  const upsertStep = useChannelEditorStore((state) => state.upsertStep)
  const currentStep = useChannelEditorStore(
    (state) => state.currentStep as ChannelNode<MessageQueueActionNodeConfig>,
  )

  const [topic, setTopic] = useState<string>('')

  // load in default values
  useEffect(() => {
    const currentConfig = { ...currentStep.metadata.config }
    if (!connections) return

    setTopic(currentConfig?.topic || '')
  }, [currentStep, connections])

  // update config and dependencies when options have been updated
  useEffect(() => {
    if (!selectedMessageQueueClient) return

    // update config
    const updatedStep = structuredClone(currentStep)

    updatedStep.metadata.config = {
      'kafkaProducer::thing': selectedMessageQueueClient.id,
      topic,
    }

    // update connections dependency array
    updatedStep.metadata.dependencies.things = [
      {
        fieldName: 'kafkaProducer::thing',
        internal: false,
        thingId: selectedMessageQueueClient.id,
      },
    ]

    // apply updates to the steps map
    upsertStep(currentStep.id, updatedStep)

    // eslint-disable-next-line -- currentStep in the dependencies array causes step configs to sometimes be copied
  }, [topic, selectedMessageQueueClient, upsertStep])

  if (!messageQueueClientOptions || messageQueueClientOptions.length <= 0)
    return (
      <p>
        <Button variant="link" onClick={() => openModal('createConnection')}>
          Add a message queue client
        </Button>{' '}
        to your space before using this step.
      </p>
    )

  return (
    <>
      <Field className="my-3">
        <FieldLabel htmlFor="topic">Topic</FieldLabel>
        <Input
          id="topic"
          name="topic"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
      </Field>
    </>
  )
}

export default KafkaActionOptions
