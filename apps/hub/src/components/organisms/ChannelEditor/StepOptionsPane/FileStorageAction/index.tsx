import useChannelEditorStore from '@gruent/hub/stores/channelEditorStore'
import { ChannelNode } from '@gruent/libs/legacy/engine/nodes/v1'
import { FileStorageActionNodeConfig } from '@gruent/libs/engine/nodes/v1/src/action/fileStorage'
import { Connection } from '@prisma/client'
import { FC, useEffect, useMemo, useState } from 'react'
import S3ActionOptions from './S3ActionOptions'
import MinioActionOptions from './MinioActionOptions'
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

export enum FileStorage {
  S3 = 'S3',
  Minio = 'Minio',
}

const FileStorageActionOptions: FC<Props> = ({ connections, orgId, spaceId }) => {
  const currentStep = useChannelEditorStore(
    (state) => state.currentStep as ChannelNode<FileStorageActionNodeConfig>,
  )

  const [selectedFileStorageConnection, setSelectedFileStorageConnection] = useState<Connection>()

  // Load the initial storage type from the currentStep config if available
  useEffect(() => {
    const currentConfig = { ...currentStep.metadata.config }
    if (!connections) return

    if (Object.keys(currentConfig).includes('s3bucket::thing')) {
      const s3Bucket = connections.find((s) => {
        if (s.id === currentConfig['s3bucket::thing']) return true
        return false
      })
      if (s3Bucket) setSelectedFileStorageConnection(s3Bucket)
      return
    }

    if (Object.keys(currentConfig).includes('minioBucket::thing')) {
      const minioBucket = connections.find((s) => {
        if (s.id === currentConfig['minioBucket::thing']) return true
        return false
      })
      if (minioBucket) setSelectedFileStorageConnection(minioBucket)
      return
    }
  }, [currentStep, connections])

  const selectedFileStorageType = useMemo(() => {
    if (!selectedFileStorageConnection) return

    if (selectedFileStorageConnection.connectionCategory === 'S3_BUCKET') return FileStorage.S3

    if (selectedFileStorageConnection.connectionCategory === 'MINIO_BUCKET')
      return FileStorage.Minio
  }, [selectedFileStorageConnection])

  const fileStorageConnections = useMemo(() => {
    if (!connections) return []

    const s3Buckets = connections.filter((connection) => {
      if (connection.connectionCategory == 'S3_BUCKET') return true
      return false
    })

    const minioBuckets = connections.filter((connection) => {
      if (connection.connectionCategory == 'MINIO_BUCKET') return true
      return false
    })

    return [...s3Buckets, ...minioBuckets]
  }, [connections])

  const fileStorageConnectionOptions = useMemo(() => {
    return fileStorageConnections.map((connection) => ({
      label: connection.name,
      value: connection.id,
    }))
  }, [fileStorageConnections])

  // Conditionally rendering subnode options based on the selected type (S3/Minio)
  const selectedSubnodeOptions = useMemo(() => {
    if (!selectedFileStorageConnection) return

    switch (selectedFileStorageType) {
      case FileStorage.S3:
        return (
          <S3ActionOptions
            connections={connections}
            orgId={orgId}
            spaceId={spaceId}
            selectedFileStorageConnection={selectedFileStorageConnection}
          />
        )
      case FileStorage.Minio:
        return (
          <MinioActionOptions
            connections={connections}
            orgId={orgId}
            spaceId={spaceId}
            selectedFileStorageConnection={selectedFileStorageConnection}
          />
        )
      default:
        return
    }
  }, [selectedFileStorageType, selectedFileStorageConnection, connections, orgId, spaceId])

  if (!fileStorageConnections || fileStorageConnections.length <= 0)
    return (
      <p className="mb-2">
        <Button variant="link" onClick={() => openModal('createConnection')}>
          Add a file storage server
        </Button>{' '}
        to your space before using this step.
      </p>
    )

  return (
    <>
      <div className="flex flex-row items-end gap-2">
        <Field className="my-3 grow">
          <FieldLabel htmlFor="fileStorageConnection">File Storage Connection</FieldLabel>
          <Select
            name="fileStorageConnection"
            value={selectedFileStorageConnection?.id ?? ''}
            onValueChange={(value) =>
              setSelectedFileStorageConnection(
                fileStorageConnections.find((s) => {
                  if (s.id === value) return true
                  return false
                }),
              )
            }
          >
            <SelectTrigger id="fileStorageConnection" className="w-full">
              <SelectValue placeholder="Select an option" />
            </SelectTrigger>
            <SelectContent>
              {fileStorageConnectionOptions.map((option) => (
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

export default FileStorageActionOptions
