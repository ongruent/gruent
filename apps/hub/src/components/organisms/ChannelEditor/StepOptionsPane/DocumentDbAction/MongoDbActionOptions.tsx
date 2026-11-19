import useChannelEditorStore from '@gruent/hub/stores/channelEditorStore'
import { addToast } from '@gruent/libs/frontend/hooks/useToast'
import { ChannelNode } from '@gruent/libs/legacy/engine/nodes/v1'
import {
  MongoDbActionSubnodeConfig,
  MongoDbQueryMethod,
  MongoDbQueryMethodOptions,
} from '@gruent/libs/legacy/engine/nodes/v1/src/action/documentDb/lib/mongodb'
import { Connection, Model } from '@prisma/client'
import { FC, useEffect, useMemo, useState } from 'react'
import { openModal } from '@gruent/libs/frontend/hooks/useModal'
import { Button } from '@gruent/libs/frontend/components/core/button'
import { Field, FieldLabel } from '@gruent/libs/frontend/components/core/field'
import { Input } from '@gruent/libs/frontend/components/core/input'
import { Textarea } from '@gruent/libs/frontend/components/core/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@gruent/libs/frontend/components/core/select'

type Props = {
  connections: Connection[]
  models: Model[]
  orgId: string
  spaceId: string
  selectedDocumentDbConnection: Connection
}

const MongoDbActionOptions: FC<Props> = ({
  connections,
  models,
  orgId,
  spaceId,
  selectedDocumentDbConnection,
}) => {
  const upsertStep = useChannelEditorStore((state) => state.upsertStep)
  const currentStep = useChannelEditorStore(
    (state) => state.currentStep as ChannelNode<MongoDbActionSubnodeConfig>,
  )

  // State variables to hold the form input values
  const [filter, setFilter] = useState<string>()
  const [database, setDatabase] = useState<string>()
  const [collection, setCollection] = useState<string>()
  const [queryMethod, setQueryMethod] = useState<MongoDbQueryMethod>()
  const [document, setDocument] = useState<string>()
  const [modelAttributes, setModelAttributes] = useState<{ [key: string]: string }>({})
  const [selectedTemplateModel, setSelectedTemplateModel] = useState<Model>()
  const [defaultValues, setDefaultValues] = useState<{ [key: string]: any }>({})

  // Load default values from the current step config
  useEffect(() => {
    const currentConfig = { ...currentStep.metadata.config }
    if (!connections) return

    setFilter(currentConfig.filter)
    setDocument(currentConfig.document)
    setQueryMethod(currentConfig.queryMethod)
    setDatabase(currentConfig.database)
    setCollection(currentConfig.collection)
    setDefaultValues(currentConfig.defaultValues || {})

    // Load initial model if available
    if (models && currentConfig['input::model']) {
      const model = models.find((m) => m.id === currentConfig['input::model'])
      if (model) setSelectedTemplateModel(model)
    }
  }, [currentStep, connections, models])

  // Update selected attributes whenever the message template changes
  const templateVariables = useMemo(() => {
    if (!selectedTemplateModel || !selectedTemplateModel.attributes || !filter) return

    // Match the message to any attempts at using a variable
    const templateVariables = (() => {
      const matches = filter.match(/\{(\w+)\}/g) || []
      return matches.map((match) => match.slice(1, -1))
    })()

    try {
      const selectedModelAttributes: { [key: string]: string } = JSON.parse(
        selectedTemplateModel.attributes.toString(),
      )

      const filteredTemplateVariables = templateVariables.filter((field) => {
        if (selectedModelAttributes) {
          const modelAttributesKeys = Object.keys(selectedModelAttributes)
          if (modelAttributesKeys && modelAttributesKeys.includes(field)) return true
        }

        return false
      })

      return filteredTemplateVariables
    } catch (e) {
      console.error(
        `could not parse the current input model attributes: ${selectedTemplateModel.attributes}`,
        e,
      )
      return []
    }
  }, [selectedTemplateModel, filter])

  // Parse the attributes and update attributes whenever the selected model changes
  useEffect(() => {
    if (!selectedTemplateModel || !selectedTemplateModel.attributes) return

    setModelAttributes({})

    try {
      const parsedAttributes: { [key: string]: string } = JSON.parse(
        selectedTemplateModel.attributes.toString(),
      )
      setModelAttributes(parsedAttributes)
    } catch (err) {
      addToast({
        title: 'Could not update the message template model',
        body: `Received err: ${err}`,
      })
    }
  }, [selectedTemplateModel])

  // update config and dependencies when options have been updated
  useEffect(() => {
    if (!selectedDocumentDbConnection) return

    // update config
    const updatedStep = structuredClone(currentStep)

    // Update the step's config with the current form and selected connection/model values
    updatedStep.metadata.config = {
      'mongoDbServer::thing': selectedDocumentDbConnection.id,
      'input::model': selectedTemplateModel?.id,
      queryMethod,
      filter,
      document,
      database,
      collection,
      defaultValues,
    }

    // Update the dependencies for the MongoDB connection in the step
    let mongoDbServerConnectionDependencyIndex = updatedStep.metadata.dependencies.things.findIndex(
      (d) => d.fieldName && d.fieldName === 'mongoDbServer::thing',
    )
    if (mongoDbServerConnectionDependencyIndex < 0)
      mongoDbServerConnectionDependencyIndex = updatedStep.metadata.dependencies.things.length

    updatedStep.metadata.dependencies.things[mongoDbServerConnectionDependencyIndex] = {
      fieldName: 'mongoDbServer::thing',
      internal: false,
      thingId: selectedDocumentDbConnection.id,
    }

    // Update the dependencies for the model in the step
    let modelDependencyIndex = updatedStep.metadata.dependencies.models.findIndex(
      (d) => d.fieldName && d.fieldName === 'input::model',
    )
    if (modelDependencyIndex < 0)
      modelDependencyIndex = updatedStep.metadata.dependencies.models.length

    if (selectedTemplateModel) {
      updatedStep.metadata.dependencies.models[modelDependencyIndex] = {
        fieldName: 'input::model',
        internal: false,
        modelId: selectedTemplateModel?.id,
      }
    }

    // Apply the updates to the step using the upsertStep function
    upsertStep(currentStep.id, updatedStep)

    // eslint-disable-next-line -- currentStep in the dependencies array causes step configs to sometimes be copied
  }, [
    selectedDocumentDbConnection,
    filter,
    document,
    queryMethod,
    database,
    collection,
    selectedTemplateModel,
    templateVariables,
    defaultValues,
    upsertStep,
  ])

  // Generate options for the Model dropdown
  const modelOptions = useMemo(() => {
    if (!models || models.length === 0) return []

    return models.map((model) => ({
      label: model.name,
      value: model.id,
    }))
  }, [models])

  const handleDefaultValueChange = (attribute: string, value: string) => {
    const expectedType = modelAttributes[attribute]
    let typedValue: any = value

    // Switch statement for type conversion based on the expected type
    switch (expectedType) {
      case 'float':
        // Check if the value is an incomplete float (ending with a period)
        if (value.match(/^\d+\.$/)) {
          // If value ends with a period (e.g., "55."), don't parse it yet
          typedValue = value
        } else {
          // Otherwise, parse it as a float
          typedValue = parseFloat(value)
          if (isNaN(typedValue)) {
            typedValue = value // Fallback to string if not a valid float
          }
        }
        break

      case 'int':
      case 'integer':
        typedValue = parseInt(value, 10)
        if (isNaN(typedValue)) {
          typedValue = value // Fallback to string if not a valid integer
        }
        break

      case 'bool':
      case 'boolean':
        // Handle boolean conversion by checking common string representations
        typedValue =
          value.toLowerCase() === 'true' ? true : value.toLowerCase() === 'false' ? false : value
        break

      case 'string':
      default:
        typedValue = value // Keep the value as a string
        break
    }

    // Update the defaultValues object with the correctly typed value
    setDefaultValues((prev) => ({
      ...prev,
      [attribute]: typedValue,
    }))
  }

  // Ensure that a MongoDB server is selected
  const mongoDbServers = useMemo(() => {
    if (!connections) return []

    return connections.filter((connection) => connection.connectionCategory == 'MONGODB_SERVER')
  }, [connections])

  // Memoize database options
  const databaseOptions = useMemo((): { label: string; value: string }[] => {
    if (!selectedDocumentDbConnection || !selectedDocumentDbConnection.attributes) return []

    try {
      const attributes = JSON.parse(selectedDocumentDbConnection.attributes as string)

      if (attributes.databases && attributes.databases.length && attributes.databases.length > 0) {
        return attributes.databases.map((database) => ({
          label: database,
          value: database,
        }))
      }
    } catch (e) {
      console.error('Could not create options for the database select field', e)
    }

    return []
  }, [selectedDocumentDbConnection])

  // Memoize database collection options
  const collectionOptions = useMemo((): { label: string; value: string }[] => {
    if (!selectedDocumentDbConnection || !selectedDocumentDbConnection.attributes) return []
    if (!database) return []

    try {
      const attributes = JSON.parse(selectedDocumentDbConnection.attributes as string)
      if (
        !attributes.collections ||
        typeof attributes.collections !== 'object' ||
        !attributes.collections[database]
      )
        return []
      if (!attributes.collections[database].length) return []

      return attributes.collections[database].map((collection) => ({
        label: collection,
        value: collection,
      }))
    } catch (e) {
      console.error('Could not create options for the database select field', e)
    }

    return []
  }, [selectedDocumentDbConnection, database])

  if (!mongoDbServers || mongoDbServers.length <= 0)
    return (
      <p>
        <Button variant="link" onClick={() => openModal('createConnection')}>
          Add a MongoDB server
        </Button>{' '}
        to your space before using this step.
      </p>
    )

  // Render form fields for the MongoDB step configuration
  return (
    <>
      {databaseOptions.length <= 0 && (
        <p>
          <a
            href={`/organizations/${orgId}/spaces/${spaceId}/connections/${selectedDocumentDbConnection.id}`}
            className="text-blue-500 underline"
          >
            Add at least one database
          </a>{' '}
          to this MongoDB server before using it.
        </p>
      )}
      {databaseOptions.length > 0 && (
        <Field className="my-3">
          <FieldLabel htmlFor="database">Database</FieldLabel>
          <Select
            name="database"
            value={database || ''}
            onValueChange={(value) => setDatabase(value)}
          >
            <SelectTrigger id="database" className="w-full">
              <SelectValue placeholder="Select an option" />
            </SelectTrigger>
            <SelectContent>
              {databaseOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}
      {database && collectionOptions.length <= 0 && (
        <p>
          <a
            href={`/organizations/${orgId}/spaces/${spaceId}/connections/${selectedDocumentDbConnection.id}`}
            className="text-blue-500 underline"
          >
            Add at least one collection
          </a>{' '}
          to this database before using it.
        </p>
      )}
      {database && collectionOptions.length > 0 && (
        <Field className="my-3">
          <FieldLabel htmlFor="collection">Collection</FieldLabel>
          <Select
            name="collection"
            value={collection || ''}
            onValueChange={(value) => setCollection(value)}
          >
            <SelectTrigger id="collection" className="w-full">
              <SelectValue placeholder="Select an option" />
            </SelectTrigger>
            <SelectContent>
              {collectionOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}
      <Field className="my-3">
        <FieldLabel htmlFor="method">Query Method</FieldLabel>
        <Select
          name="method"
          value={queryMethod || ''}
          onValueChange={(value) => setQueryMethod(value as MongoDbQueryMethod | undefined)}
        >
          <SelectTrigger id="method" className="w-full">
            <SelectValue placeholder="Select an option" />
          </SelectTrigger>
          <SelectContent>
            {MongoDbQueryMethodOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      {(queryMethod === MongoDbQueryMethod.Find ||
        queryMethod === MongoDbQueryMethod.FindOne ||
        queryMethod === MongoDbQueryMethod.FindOneAndUpdate ||
        queryMethod === MongoDbQueryMethod.FindOneAndReplace ||
        queryMethod === MongoDbQueryMethod.FindOneAndDelete ||
        queryMethod === MongoDbQueryMethod.DeleteOne ||
        queryMethod === MongoDbQueryMethod.DeleteMany ||
        queryMethod === MongoDbQueryMethod.ReplaceOne ||
        queryMethod === MongoDbQueryMethod.UpdateOne) && (
        // TODO:
        // queryMethod === MongoDbQueryMethod.UpdateMany
        <>
          <Field className="my-3">
            <FieldLabel htmlFor="filter">Query Filter</FieldLabel>
            <Textarea
              id="filter"
              className="min-h-36"
              name="filter"
              value={filter || ''}
              onChange={(e) => setFilter(e.target.value)}
            />
          </Field>
        </>
      )}
      {(queryMethod === MongoDbQueryMethod.FindOneAndUpdate ||
        queryMethod === MongoDbQueryMethod.FindOneAndReplace ||
        queryMethod === MongoDbQueryMethod.InsertOne ||
        queryMethod === MongoDbQueryMethod.ReplaceOne ||
        queryMethod === MongoDbQueryMethod.UpdateOne) && (
        // TODO:
        // queryMethod === MongoDbQueryMethod.InsertMany
        // queryMethod === MongoDbQueryMethod.UpdateMany
        <>
          <Field className="my-3">
            <FieldLabel htmlFor="document">Document</FieldLabel>
            <Textarea
              id="document"
              className="min-h-36"
              name="document"
              value={document || ''}
              onChange={(e) => setDocument(e.target.value)}
            />
          </Field>
        </>
      )}
      {selectedDocumentDbConnection && models && (
        <>
          <Field className="my-3">
            <FieldLabel htmlFor="templateModel">Template model (optional)</FieldLabel>
            <Select
              name="templateModel"
              value={selectedTemplateModel?.id || ''}
              onValueChange={(value) =>
                setSelectedTemplateModel(models.find((m) => m.id === value))
              }
            >
              <SelectTrigger id="templateModel" className="w-full">
                <SelectValue placeholder="Select an option" />
              </SelectTrigger>
              <SelectContent>
                {modelOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </>
      )}
      {selectedTemplateModel && templateVariables && templateVariables.length > 0 && (
        <>
          <h3>Message Template Variables</h3>
          {templateVariables.map((field) => (
            <Field key={field} className="my-3">
              <FieldLabel htmlFor={field}>{field}</FieldLabel>
              <Input
                id={field}
                name={field}
                placeholder={`Default value for ${field} (optional)`}
                value={defaultValues[field] || ''}
                onChange={(e) => handleDefaultValueChange(field, e.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
            </Field>
          ))}
        </>
      )}
    </>
  )
}

export default MongoDbActionOptions
