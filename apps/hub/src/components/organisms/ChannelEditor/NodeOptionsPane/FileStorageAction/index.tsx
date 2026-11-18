import useChannelEditorStore from '@gruent/hub/stores/channelEditorStore'
import { ChannelNode } from '@gruent/libs/legacy/engine/nodes/v1'
import { FileStorageActionNodeConfig } from '@gruent/libs/engine/nodes/v1/src/action/fileStorage'
import { Thing } from '@prisma/client'
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
  things: Thing[]
  orgId: string
  spaceId: string
}

export enum FileStorage {
  S3 = 'S3',
  Minio = 'Minio',
}

const FileStorageActionOptions: FC<Props> = ({ things, orgId, spaceId }) => {
  const currentNode = useChannelEditorStore(
    (state) => state.currentNode as ChannelNode<FileStorageActionNodeConfig>,
  )

  const [selectedFileStorageThing, setSelectedFileStorageThing] = useState<Thing>()

  // Load the initial storage type from the currentNode config if available
  useEffect(() => {
    const currentConfig = { ...currentNode.metadata.config }
    if (!things) return

    if (Object.keys(currentConfig).includes('s3bucket::thing')) {
      const s3Bucket = things.find((s) => {
        if (s.id === currentConfig['s3bucket::thing']) return true
        return false
      })
      if (s3Bucket) setSelectedFileStorageThing(s3Bucket)
      return
    }

    if (Object.keys(currentConfig).includes('minioBucket::thing')) {
      const minioBucket = things.find((s) => {
        if (s.id === currentConfig['minioBucket::thing']) return true
        return false
      })
      if (minioBucket) setSelectedFileStorageThing(minioBucket)
      return
    }
  }, [currentNode, things])

  const selectedFileStorageType = useMemo(() => {
    if (!selectedFileStorageThing) return

    if (selectedFileStorageThing.thingCategory === 'S3_BUCKET') return FileStorage.S3

    if (selectedFileStorageThing.thingCategory === 'MINIO_BUCKET') return FileStorage.Minio
  }, [selectedFileStorageThing])

  const fileStorageThings = useMemo(() => {
    if (!things) return []

    const s3Buckets = things.filter((thing) => {
      if (thing.thingCategory == 'S3_BUCKET') return true
      return false
    })

    const minioBuckets = things.filter((thing) => {
      if (thing.thingCategory == 'MINIO_BUCKET') return true
      return false
    })

    return [...s3Buckets, ...minioBuckets]
  }, [things])

  const fileStorageThingOptions = useMemo(() => {
    return fileStorageThings.map((thing) => ({
      label: thing.name,
      value: thing.id,
    }))
  }, [fileStorageThings])

  // Conditionally rendering subnode options based on the selected type (S3/Minio)
  const selectedSubnodeOptions = useMemo(() => {
    if (!selectedFileStorageThing) return

    switch (selectedFileStorageType) {
      case FileStorage.S3:
        return (
          <S3ActionOptions
            things={things}
            orgId={orgId}
            spaceId={spaceId}
            selectedFileStorageThing={selectedFileStorageThing}
          />
        )
      case FileStorage.Minio:
        return (
          <MinioActionOptions
            things={things}
            orgId={orgId}
            spaceId={spaceId}
            selectedFileStorageThing={selectedFileStorageThing}
          />
        )
      default:
        return
    }
  }, [selectedFileStorageType, selectedFileStorageThing, things, orgId, spaceId])

  if (!fileStorageThings || fileStorageThings.length <= 0)
    return (
      <p className="mb-2">
        <Button variant="link" onClick={() => openModal('createThing')}>
          Add a file storage server
        </Button>{' '}
        to your space before using this node.
      </p>
    )

  return (
    <>
      <div className="flex flex-row items-end gap-2">
        <Field className="my-3 grow">
          <FieldLabel htmlFor="fileStorageThing">File Storage Thing</FieldLabel>
          <Select
            name="fileStorageThing"
            value={selectedFileStorageThing?.id ?? ''}
            onValueChange={(value) =>
              setSelectedFileStorageThing(
                fileStorageThings.find((s) => {
                  if (s.id === value) return true
                  return false
                }),
              )
            }
          >
            <SelectTrigger id="fileStorageThing" className="w-full">
              <SelectValue placeholder="Select an option" />
            </SelectTrigger>
            <SelectContent>
              {fileStorageThingOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Button
          size="icon"
          aria-label="Create thing"
          className="my-3"
          onClick={() => openModal('createThing')}
        >
          <PlusIcon />
        </Button>
      </div>
      {selectedSubnodeOptions}
    </>
  )
}

export default FileStorageActionOptions
