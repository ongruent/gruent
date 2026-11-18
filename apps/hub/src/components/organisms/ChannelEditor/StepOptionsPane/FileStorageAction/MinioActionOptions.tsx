import useChannelEditorStore from '@gruent/hub/stores/channelEditorStore'
import { ChannelNode } from '@gruent/libs/legacy/engine/nodes/v1'
import { MinioActionSubnodeConfig } from '@gruent/libs/engine/nodes/v1/src/action/fileStorage/lib/minio'
import { Connection } from '@prisma/client'
import { FC, useEffect, useMemo, useState } from 'react'
import { openModal } from '@gruent/libs/frontend/hooks/useModal'
import { Button } from '@gruent/libs/frontend/components/core/button'
import { Field, FieldLabel } from '@gruent/libs/frontend/components/core/field'
import { Input } from '@gruent/libs/frontend/components/core/input'

type Props = {
  connections: Connection[]
  orgId: string
  spaceId: string
  selectedFileStorageConnection: Connection
}

const MinioActionOptions: FC<Props> = ({ connections, selectedFileStorageConnection }) => {
  const upsertStep = useChannelEditorStore((state) => state.upsertStep)
  const currentStep = useChannelEditorStore(
    (state) => state.currentStep as ChannelNode<MinioActionSubnodeConfig>,
  )

  const [minioKey, setMinioKey] = useState<string>()

  // load in default values
  useEffect(() => {
    const currentConfig = { ...currentStep.metadata.config }
    if (!connections) return

    setMinioKey(currentConfig.key)
  }, [currentStep, connections])

  // update config and dependencies when options have been updated
  useEffect(() => {
    if (!minioKey) return
    if (!selectedFileStorageConnection) return

    // update config
    const updatedStep = structuredClone(currentStep)

    updatedStep.metadata.config = {
      'minioBucket::thing': selectedFileStorageConnection.id,
      key: minioKey,
    }

    // update dependencies array
    let minioBucketConnectionDependencyIndex = updatedStep.metadata.dependencies.things.findIndex(
      (d) => d.fieldName && d.fieldName === 'minioBucket::thing',
    )
    if (minioBucketConnectionDependencyIndex < 0)
      minioBucketConnectionDependencyIndex = updatedStep.metadata.dependencies.things.length

    updatedStep.metadata.dependencies.things[minioBucketConnectionDependencyIndex] = {
      fieldName: 'minioBucket::thing',
      internal: false,
      thingId: selectedFileStorageConnection.id,
    }

    // apply updates to the steps map
    upsertStep(currentStep.id, updatedStep)

    // eslint-disable-next-line -- currentStep in the dependencies array causes step configs to sometimes be copied
  }, [selectedFileStorageConnection, minioKey, upsertStep])

  const minioBuckets = useMemo(() => {
    if (!connections) return []

    return connections.filter((connection) => {
      if (connection.connectionCategory == 'MINIO_BUCKET') return true
      return false
    })
  }, [connections])

  if (!minioBuckets || minioBuckets.length <= 0)
    return (
      <p>
        <Button variant="link" onClick={() => openModal('createConnection')}>
          Add a Minio Bucket
        </Button>{' '}
        to your space before using this step.
      </p>
    )

  return (
    <>
      <Field className="my-3">
        <FieldLabel htmlFor="minioKey">Minio Key</FieldLabel>
        <Input
          id="minioKey"
          name="minioKey"
          value={minioKey || ''}
          onChange={(e) => setMinioKey(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
      </Field>
    </>
  )
}

export default MinioActionOptions
