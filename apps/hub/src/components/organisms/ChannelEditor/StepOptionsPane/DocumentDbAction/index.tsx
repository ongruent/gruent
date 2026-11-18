import useChannelEditorStore from '@gruent/hub/stores/channelEditorStore'
import { ChannelNode } from '@gruent/libs/legacy/engine/nodes/v1'
import { DocumentDbActionNodeConfig } from '@gruent/libs/engine/nodes/v1/src/action/documentDb'
import { Connection, Model } from '@prisma/client'
import { FC, useEffect, useMemo, useState } from 'react'
import MongoDbActionOptions from './MongoDbActionOptions'
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
  models: Model[]
}

export enum DocumentDB {
  MONGODB_SERVER = 'MONGODB_SERVER',
}

const DocumentDbActionOptions: FC<Props> = ({ connections, orgId, spaceId, models }) => {
  // Accessing the current step in the editor store
  const currentStep = useChannelEditorStore(
    (state) => state.currentStep as ChannelNode<DocumentDbActionNodeConfig>,
  )
  const upsertStep = useChannelEditorStore((state) => state.upsertStep)
  const setCurrentStep = useChannelEditorStore((state) => state.setCurrentStep)

  // State to hold the selected document DB connection
  const [selectedDocumentDatabaseConnection, setSelectedDocumentDbConnection] =
    useState<Connection>()

  // Load initial config
  useEffect(() => {
    const currentConfig = { ...currentStep.metadata.config }
    if (!connections || !models) return

    // Check if a MongoDB connection is already selected in the config
    if (Object.keys(currentConfig).includes('mongoDbServer::thing')) {
      const documentDb = connections.find((s) => {
        if (s.id === currentConfig['mongoDbServer::thing']) return true
        return false
      })
      if (documentDb) setSelectedDocumentDbConnection(documentDb)
      return
    }
  }, [currentStep, connections, models])

  // Reset database and collection when selected Document DB connection changes
  useEffect(() => {
    if (!selectedDocumentDatabaseConnection) return
    if (
      selectedDocumentDatabaseConnection.id === currentStep.metadata.config['mongoDbServer::thing']
    )
      return

    const updatedStep = structuredClone(currentStep)
    updatedStep.metadata.config = {
      ...currentStep.metadata.config,
      'mongoDbServer::thing': selectedDocumentDatabaseConnection.id,
      database: undefined,
      collection: undefined,
    }
    updatedStep.metadata.dependencies.things = []
    updatedStep.metadata.dependencies.models = currentStep?.metadata?.dependencies?.models

    // Apply the updates to the step using the upsertStep function
    upsertStep(currentStep.id, updatedStep)
    setCurrentStep(updatedStep)
  }, [selectedDocumentDatabaseConnection, currentStep, upsertStep, setCurrentStep])

  // Determine the database type based on the selected connection
  const selectedDocumentDbType = useMemo(() => {
    if (!selectedDocumentDatabaseConnection) return

    if (selectedDocumentDatabaseConnection.connectionCategory === 'MONGODB_SERVER')
      return DocumentDB.MONGODB_SERVER
  }, [selectedDocumentDatabaseConnection])

  // Generate a filtered list of available database types
  const documentDbConnections = useMemo(() => {
    if (!connections) return []

    const mongodbServers = connections.filter((connection) => {
      if (connection.connectionCategory == 'MONGODB_SERVER') return true
      return false
    })

    return [...mongodbServers]
  }, [connections])

  // Generate options for the document database dropdown
  const documentDbOptions = useMemo(() => {
    return documentDbConnections.map((connection) => ({
      label: connection.name,
      value: connection.id,
    }))
  }, [documentDbConnections])

  // Conditionally rendering subnode options based on the selected type (SES/SNS)
  const selectedSubnodeOptions = useMemo(() => {
    if (!selectedDocumentDatabaseConnection) return

    switch (selectedDocumentDbType) {
      case DocumentDB.MONGODB_SERVER:
        return (
          <MongoDbActionOptions
            connections={connections}
            orgId={orgId}
            spaceId={spaceId}
            selectedDocumentDbConnection={selectedDocumentDatabaseConnection}
            models={models}
          />
        )
      default:
        return
    }
  }, [
    models,
    selectedDocumentDbType,
    selectedDocumentDatabaseConnection,
    connections,
    orgId,
    spaceId,
  ])

  if (!documentDbConnections || documentDbConnections.length <= 0)
    return (
      <p className="mb-2">
        <Button variant="link" onClick={() => openModal('createConnection')}>
          Add a document database
        </Button>{' '}
        to your space before using this step.
      </p>
    )

  return (
    <>
      <div className="flex flex-row items-end gap-2">
        <Field className="my-3 grow">
          <FieldLabel htmlFor="DocumentDbConnection">Document Database Connection</FieldLabel>
          <Select
            name="DocumentDbConnection"
            value={selectedDocumentDatabaseConnection?.id ?? ''}
            onValueChange={(value) =>
              setSelectedDocumentDbConnection(
                documentDbConnections.find((s) => {
                  if (s.id === value) return true
                  return false
                }),
              )
            }
          >
            <SelectTrigger id="DocumentDbConnection" className="w-full">
              <SelectValue placeholder="Select an option" />
            </SelectTrigger>
            <SelectContent>
              {documentDbOptions.map((option) => (
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

export default DocumentDbActionOptions
