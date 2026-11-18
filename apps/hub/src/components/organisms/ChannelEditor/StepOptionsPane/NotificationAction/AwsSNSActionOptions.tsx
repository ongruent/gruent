import useChannelEditorStore from '@gruent/hub/stores/channelEditorStore'
import { addToast } from '@gruent/libs/frontend/hooks/useToast'
import { ChannelNode } from '@gruent/libs/legacy/engine/nodes/v1'
import { AwsSNSActionSubnodeConfig } from '@gruent/libs/engine/nodes/v1/src/action/notification/lib/awsSNS'
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
  selectedNotificationConnection: Connection
}

const AwsSNSOptions: FC<Props> = ({ connections, models, selectedNotificationConnection }) => {
  const upsertStep = useChannelEditorStore((state) => state.upsertStep)
  const currentStep = useChannelEditorStore(
    (state) => state.currentStep as ChannelNode<AwsSNSActionSubnodeConfig>,
  )

  // State variables to hold the form input values
  const [topicARN, setTopicARN] = useState<string>()
  const [templateMessage, setTemplateMessage] = useState<string>()
  const [selectedTemplateModel, setSelectedTemplateModel] = useState<Model>()
  const [modelAttributes, setModelAttributes] = useState<{ [key: string]: string }>({})
  const [defaultValues, setDefaultValues] = useState<{ [key: string]: any }>({})

  // Load default values from the current step config
  useEffect(() => {
    const currentConfig = { ...currentStep.metadata.config }
    if (!connections) return

    setTopicARN(currentConfig.topicARN)
    setTemplateMessage(currentConfig.templateMessage) // Load the template
    setDefaultValues(currentConfig.defaultValues || {}) // Load default values

    // Load initial model if available
    if (models && currentConfig['input::model']) {
      const model = models.find((m) => m.id === currentConfig['input::model'])
      if (model) setSelectedTemplateModel(model)
    }
  }, [currentStep, connections, models])

  // Update selected attributes whenever the message template changes
  const templateVariables = useMemo(() => {
    if (!selectedTemplateModel || !selectedTemplateModel.attributes || !templateMessage) return

    // Match the message to any attempts at using a variable
    const templateVariables = (() => {
      const matches = templateMessage.match(/\{([^}]+)\}/g) || []
      return matches.map((match) => match.slice(1, -1))
    })()

    try {
      const selectedModelAttributes: { [key: string]: string } = JSON.parse(
        selectedTemplateModel.attributes.toString(),
      )

      const filteredTemplateVariables = templateVariables.filter((attribute) => {
        if (selectedModelAttributes) {
          const schemaKeys = Object.keys(selectedModelAttributes)
          if (schemaKeys && schemaKeys.includes(attribute)) return true
        }

        return false
      })

      return filteredTemplateVariables
    } catch (e) {
      console.error(
        `could not parse the current input model schema: ${selectedTemplateModel.attributes}`,
        e,
      )
      return []
    }
  }, [selectedTemplateModel, templateMessage])

  // Parse the schema and update attributes whenever the selected model changes
  useEffect(() => {
    if (!selectedTemplateModel || !selectedTemplateModel.attributes) return

    setModelAttributes({})

    try {
      const parsedSchema: { [key: string]: string } = JSON.parse(
        selectedTemplateModel.attributes.toString(),
      )
      setModelAttributes(parsedSchema)
    } catch (err) {
      addToast({
        title: 'Could not update the message template model',
        body: `Received err: ${err}`,
      })
    }
  }, [selectedTemplateModel])

  // update config and dependencies when options have been updated
  useEffect(() => {
    if (!topicARN || !templateMessage || !selectedNotificationConnection) return

    // update config
    const updatedStep = structuredClone(currentStep)

    // Update the step's config with the current form and selected connection/model values
    updatedStep.metadata.config = {
      'awsSNS::thing': selectedNotificationConnection.id,
      'input::model': selectedTemplateModel?.id,
      topicARN: topicARN,
      templateMessage: templateMessage,
      defaultValues: defaultValues,
    }

    // Update the dependencies for the SNS connection in the step
    let awsSNSConnectionDependencyIndex = updatedStep.metadata.dependencies.things.findIndex(
      (d) => d.fieldName && d.fieldName === 'awsSNS::thing',
    )
    if (awsSNSConnectionDependencyIndex < 0)
      awsSNSConnectionDependencyIndex = updatedStep.metadata.dependencies.things.length

    updatedStep.metadata.dependencies.things[awsSNSConnectionDependencyIndex] = {
      fieldName: 'awsSNS::thing',
      internal: false,
      thingId: selectedNotificationConnection.id,
    }

    // Update the dependencies for the model in the step
    let awsSNSModelDependencyIndex = updatedStep.metadata.dependencies.models.findIndex(
      (d) => d.fieldName && d.fieldName === 'input::model',
    )
    if (awsSNSModelDependencyIndex < 0)
      awsSNSModelDependencyIndex = updatedStep.metadata.dependencies.models.length

    if (selectedTemplateModel) {
      updatedStep.metadata.dependencies.models[awsSNSModelDependencyIndex] = {
        fieldName: 'input::model',
        internal: false,
        modelId: selectedTemplateModel?.id,
      }
    } else {
      updatedStep.metadata.dependencies.models.splice(awsSNSModelDependencyIndex, 1)
    }

    // Apply the updates to the step using the upsertStep function
    upsertStep(currentStep.id, updatedStep)

    // eslint-disable-next-line -- currentStep in the dependencies array causes step configs to sometimes be copied
  }, [
    selectedNotificationConnection,
    selectedTemplateModel,
    topicARN,
    templateMessage,
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
        // Parse as float unless it's incomplete (e.g., "55.")
        typedValue = value.match(/^\d+\.$/) ? value : parseFloat(value)
        if (isNaN(typedValue)) typedValue = value
        break

      case 'int':
      case 'integer':
        typedValue = parseInt(value, 10)
        if (isNaN(typedValue)) typedValue = value
        break

      case 'bool':
      case 'boolean':
        typedValue =
          value.toLowerCase() === 'true' ? true : value.toLowerCase() === 'false' ? false : value
        break

      case 'string':
      default:
        typedValue = value // Keep as string
        break
    }

    // Update the defaultValues object with the correctly typed value
    setDefaultValues((prev) => ({
      ...prev,
      [attribute]: typedValue,
    }))
  }

  // Ensure that AWS SNS is selected
  const awsSNS = useMemo(() => {
    if (!connections) return []

    return connections.filter((connection) => connection.connectionCategory == 'AWS_SNS_ENDPOINT')
  }, [connections])

  if (!awsSNS || awsSNS.length <= 0)
    return (
      <p>
        <Button variant="link" onClick={() => openModal('createConnection')}>
          Add an AWS SNS Endpoint
        </Button>{' '}
        to your space before using this step.
      </p>
    )

  // Render form fields for the SNS step configuration
  return (
    <>
      <Field className="my-3">
        <FieldLabel htmlFor="topicARN">Topic ARN</FieldLabel>
        <Input
          id="topicARN"
          name="topicARN"
          value={topicARN || ''}
          onChange={(e) => setTopicARN(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
      </Field>
      <Field className="my-3">
        <FieldLabel htmlFor="templateMessage">Template Message</FieldLabel>
        <Textarea
          id="templateMessage"
          className="min-h-36"
          name="templateMessage"
          value={templateMessage || ''}
          onChange={(e) => setTemplateMessage(e.target.value)}
        />
      </Field>
      {selectedNotificationConnection && models && (
        <>
          {/* Add model dropdown after selecting SES or SNS */}
          <Field className="my-3">
            <FieldLabel htmlFor="templateModel">Template model (optional)</FieldLabel>
            <Select
              name="templateModel"
              value={selectedTemplateModel?.id || ''}
              onValueChange={(value) =>
                setSelectedTemplateModel(models.find((s) => s.id === value))
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
          {templateVariables.map((attribute) => (
            <Field key={attribute} className="my-3">
              <FieldLabel htmlFor={attribute}>{attribute}</FieldLabel>
              <Input
                id={attribute}
                name={attribute}
                placeholder={`Default value for ${attribute} (optional)`}
                value={defaultValues[attribute] || ''}
                onChange={(e) => handleDefaultValueChange(attribute, e.target.value)}
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

export default AwsSNSOptions
