import useChannelEditorStore from '@gruent/hub/stores/channelEditorStore'
import { addToast } from '@gruent/libs/frontend/hooks/useToast'
import { ChannelNode } from '@gruent/libs/legacy/engine/nodes/v1'
import { SendgridActionSubnodeConfig } from '@gruent/libs/engine/nodes/v1/src/action/notification/lib/sendgrid'
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

const SendgridActionOptions: FC<Props> = ({
  connections,
  models,
  selectedNotificationConnection,
}) => {
  const upsertStep = useChannelEditorStore((state) => state.upsertStep)
  const currentStep = useChannelEditorStore(
    (state) => state.currentStep as ChannelNode<SendgridActionSubnodeConfig>,
  )

  // State variables to hold the form input values
  const [sender, setSender] = useState<string>()
  const [sendAs, setSendAs] = useState<string>()
  const [receiver, setReceiver] = useState<string>()
  const [subject, setSubject] = useState<string>()
  const [templateMessage, setTemplateMessage] = useState<string>()
  const [selectedTemplateModel, setSelectedTemplateModel] = useState<Model>()
  const [modelAttributes, setModelAttributes] = useState<{ [key: string]: string }>({})
  const [defaultValues, setDefaultValues] = useState<{ [key: string]: any }>({})

  // Load default values from the current step config
  useEffect(() => {
    const currentConfig = { ...currentStep.metadata.config }
    if (!connections) return

    setSender(currentConfig.sender)
    setReceiver(currentConfig.receiver)
    setSubject(currentConfig.subject)
    setTemplateMessage(currentConfig.templateMessage) // Load the template
    setDefaultValues(currentConfig.defaultValues || {}) // Load default values

    // Load initial model if available
    if (models && currentConfig['input::model']) {
      const model = models.find((m) => m.id === currentConfig['input::model'])
      if (model) setSelectedTemplateModel(model)
    }
  }, [currentStep, connections, models])

  // Update selected fields whenever the message template changes
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
        `could not parse the current input model attributes: ${selectedTemplateModel.attributes}`,
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
    if (!sender || !receiver || !subject || !templateMessage || !selectedNotificationConnection)
      return

    // update config
    const updatedStep = structuredClone(currentStep)

    // Update the step's config with the current form and selected connection/model values
    updatedStep.metadata.config = {
      'sendgridClient::thing': selectedNotificationConnection.id,
      'input::model': selectedTemplateModel?.id,
      sender: sender,
      sendAs: sendAs,
      receiver: receiver,
      subject: subject,
      templateMessage: templateMessage,
      defaultValues: defaultValues,
    }

    // Update the dependencies for the SES connection in the step
    let sendgridClientConnectionDependencyIndex =
      updatedStep.metadata.dependencies.things.findIndex(
        (d) => d.fieldName && d.fieldName === 'sendgridClient::thing',
      )
    if (sendgridClientConnectionDependencyIndex < 0)
      sendgridClientConnectionDependencyIndex = updatedStep.metadata.dependencies.things.length

    updatedStep.metadata.dependencies.things[sendgridClientConnectionDependencyIndex] = {
      fieldName: 'sendgridClient::thing',
      internal: false,
      thingId: selectedNotificationConnection.id,
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
    } else {
      updatedStep.metadata.dependencies.models.splice(modelDependencyIndex, 1)
    }

    // Apply the updates to the step using the upsertStep function
    upsertStep(currentStep.id, updatedStep)

    // eslint-disable-next-line -- currentStep in the dependencies array causes step configs to sometimes be copied
  }, [
    selectedNotificationConnection,
    selectedTemplateModel,
    sender,
    receiver,
    subject,
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

  // Ensure that a Sendgrid client is selected
  const sendgridClients = useMemo(() => {
    if (!connections) return []

    return connections.filter((connection) => connection.connectionCategory == 'SENDGRID_CLIENT')
  }, [connections])

  if (!sendgridClients || sendgridClients.length <= 0)
    return (
      <p>
        <Button variant="link" onClick={() => openModal('createConnection')}>
          Add a Sendgrid client
        </Button>{' '}
        to your space before using this step.
      </p>
    )

  // Render form fields for the Sendgrid step configuration
  return (
    <>
      <Field className="my-3">
        <FieldLabel htmlFor="sender">Sender</FieldLabel>
        <Input
          id="sender"
          name="sender"
          value={sender || ''}
          onChange={(e) => setSender(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
      </Field>
      <Field className="my-3">
        <FieldLabel htmlFor="sendAs">Send As (optional)</FieldLabel>
        <Input
          id="sendAs"
          name="sendAs"
          value={sendAs || ''}
          onChange={(e) => setSendAs(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
      </Field>
      <Field className="my-3">
        <FieldLabel htmlFor="receiver">Receiver</FieldLabel>
        <Input
          id="receiver"
          name="receiver"
          value={receiver || ''}
          onChange={(e) => setReceiver(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
      </Field>
      <Field className="my-3">
        <FieldLabel htmlFor="subject">Subject</FieldLabel>
        <Input
          id="subject"
          name="subject"
          value={subject || ''}
          onChange={(e) => setSubject(e.target.value)}
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

export default SendgridActionOptions
