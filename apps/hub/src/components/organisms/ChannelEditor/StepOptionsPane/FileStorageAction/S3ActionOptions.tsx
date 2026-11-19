import useChannelEditorStore from '@gruent/hub/stores/channelEditorStore'
import { ChannelNode } from '@gruent/libs/legacy/engine/nodes/v1'
import { S3ActionSubnodeConfig } from '@gruent/libs/engine/nodes/v1/src/action/fileStorage/lib/awsS3'
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

const S3ActionOptions: FC<Props> = ({ connections, selectedFileStorageConnection }) => {
  const upsertStep = useChannelEditorStore((state) => state.upsertStep)
  const currentStep = useChannelEditorStore(
    (state) => state.currentStep as ChannelNode<S3ActionSubnodeConfig>,
  )

  const [s3Key, setS3Key] = useState<string>()

  // load in default values
  useEffect(() => {
    const currentConfig = { ...currentStep.metadata.config }
    if (!connections) return

    setS3Key(currentConfig.key)
  }, [currentStep, connections])

  // update config and dependencies when options have been updated
  useEffect(() => {
    if (!s3Key) return
    if (!selectedFileStorageConnection) return

    // update config
    const updatedStep = structuredClone(currentStep)

    updatedStep.metadata.config = {
      's3bucket::thing': selectedFileStorageConnection.id,
      key: s3Key,
    }

    // update dependencies array
    let s3BucketConnectionDependencyIndex = updatedStep.metadata.dependencies.things.findIndex(
      (d) => d.fieldName && d.fieldName === 's3bucket::thing',
    )
    if (s3BucketConnectionDependencyIndex < 0)
      s3BucketConnectionDependencyIndex = updatedStep.metadata.dependencies.things.length

    updatedStep.metadata.dependencies.things[s3BucketConnectionDependencyIndex] = {
      fieldName: 's3bucket::thing',
      internal: false,
      thingId: selectedFileStorageConnection.id,
    }

    // apply updates to the steps map
    upsertStep(currentStep.id, updatedStep)

    // eslint-disable-next-line -- currentStep in the dependencies array causes step configs to sometimes be copied
  }, [selectedFileStorageConnection, s3Key, upsertStep])

  const s3Buckets = useMemo(() => {
    if (!connections) return []

    return connections.filter((connection) => {
      if (connection.connectionCategory == 'S3_BUCKET') return true
      return false
    })
  }, [connections])

  if (!s3Buckets || s3Buckets.length <= 0)
    return (
      <p>
        <Button variant="link" onClick={() => openModal('createConnection')}>
          Add an S3 Bucket
        </Button>{' '}
        to your space before using this step.
      </p>
    )

  return (
    <>
      <Field className="my-3">
        <FieldLabel htmlFor="s3Key">S3 Key</FieldLabel>
        <Input
          id="s3Key"
          name="s3Key"
          value={s3Key || ''}
          onChange={(e) => setS3Key(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
      </Field>
    </>
  )
}

export default S3ActionOptions
