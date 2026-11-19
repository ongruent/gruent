import useChannelEditorStore from '@gruent/hub/stores/channelEditorStore'
import Modal from '@gruent/libs/frontend/components/Modal'
import { openModal } from '@gruent/libs/frontend/hooks/useModal'
import { ChannelNode, BooleanConditionalNodeConfig } from '@gruent/libs/legacy/engine/nodes/v1'
import { BooleanCondition } from '@gruent/libs/engine/nodes/v1/src/conditional/boolean'
import { PlusIcon, XIcon } from 'lucide-react'
import { Dispatch, FC, SetStateAction, useEffect, useMemo, useState, useCallback } from 'react'
import { ModelAttributes } from '@gruent/libs/engine/dependencies/models'
import { Model } from '@prisma/client'
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
  models: Model[]
  orgId: string
  spaceId: string
}

const BooleanConditionalOptions: FC<Props> = ({ models, orgId, spaceId }) => {
  const upsertStep = useChannelEditorStore((state) => state.upsertStep)
  const currentStep = useChannelEditorStore(
    (state) => state.currentStep as ChannelNode<BooleanConditionalNodeConfig>,
  )

  const [model, setModel] = useState<Model>()
  const [conditions, setConditions] = useState<BooleanCondition[]>([])
  const [logicalOperator, setLogicalOperator] = useState<'AND' | 'OR'>('OR')

  // load in default values
  useEffect(() => {
    const currentConfig = { ...currentStep.metadata.config }
    if (!models || models.length <= 0) return

    const model = models.find((model) => {
      if (model.id === currentConfig['model::model']) return true
      return false
    })

    setModel(model)
    setConditions(currentConfig.conditions || [])
    setLogicalOperator(currentConfig.logicalOperator || 'OR')
  }, [currentStep, models])

  // update config and dependencies when options have been updated
  useEffect(() => {
    if (!model) return

    // update config
    const updatedStep = structuredClone(currentStep)
    updatedStep.metadata.config = {
      'model::model': model ? model.id : '',
      conditions,
      logicalOperator,
    }

    // update dependencies
    updatedStep.metadata.dependencies.models = [
      {
        modelId: model.id,
        internal: false,
        fieldName: 'model::model',
      },
    ]

    upsertStep(currentStep.id, updatedStep)

    // eslint-disable-next-line -- currentStep in the dependencies array causes step configs to sometimes be copied
  }, [model, conditions, logicalOperator, upsertStep])

  const modelOptions = useMemo(() => {
    if (!models) return []

    return models.map((model) => ({
      label: model.name,
      value: model.id,
    }))
  }, [models])

  if (!models || models.length < 1)
    return (
      <p className="mb-2">
        <Button variant="link" onClick={() => openModal('createModel')}>
          Add at least one model
        </Button>{' '}
        to your space before using this step.
      </p>
    )

  return (
    <>
      <BooleanStepModal
        model={model}
        conditions={conditions}
        orgId={orgId}
        spaceId={spaceId}
        setConditions={setConditions}
      />
      <div className="flex flex-row items-end gap-2">
        <Field className="my-3 grow">
          <FieldLabel htmlFor="model">Model</FieldLabel>
          <Select
            name="model"
            value={model ? model.id : ''}
            onValueChange={(value) => setModel(models.find((m) => m.id === value))}
          >
            <SelectTrigger id="model" className="w-full">
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
        <Button
          size="icon"
          aria-label="Create model"
          className="my-3"
          onClick={() => openModal('createModel')}
        >
          <PlusIcon />
        </Button>
      </div>
      <Field className="my-3">
        <FieldLabel htmlFor="logicalOperator">Logical Operator</FieldLabel>
        <Select
          name="logicalOperator"
          value={logicalOperator}
          onValueChange={(value) => setLogicalOperator(value as 'AND' | 'OR')}
        >
          <SelectTrigger id="logicalOperator" className="w-full">
            <SelectValue placeholder="Select an option" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="OR">OR</SelectItem>
            <SelectItem value="AND">AND</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Button className="w-full mb-2" onClick={() => openModal('booleanConditions')}>
        Edit conditions
      </Button>
    </>
  )
}

type BooleanModalProps = {
  conditions: BooleanCondition[]
  model?: Model
  orgId: string
  spaceId: string
  setConditions: Dispatch<SetStateAction<BooleanCondition[]>>
}

const BooleanStepModal: FC<BooleanModalProps> = ({
  conditions,
  model,
  orgId,
  spaceId,
  setConditions,
}) => {
  const modelAttributes: ModelAttributes = useMemo(() => {
    if (model && model.attributes) return JSON.parse(model.attributes as string) as ModelAttributes
    return {}
  }, [model])

  const flattenSchemaFields = useCallback(
    (
      attributes: ModelAttributes,
      parentId = '',
      prefix = '',
    ): Array<{ key: string; value: string }> => {
      if (!attributes || Object.keys(attributes).length <= 0) return []

      const fieldsInObject = Object.entries(attributes).filter(([_attributeId, attribute]) => {
        if (parentId) return attribute.parentId === parentId
        return !attribute.parentId
      })

      return fieldsInObject.flatMap(([attributeId, attribute]) => {
        if (attribute.type === 'object') {
          const newPrefix = prefix ? `${prefix}.${attribute.key}` : attribute.key
          return flattenSchemaFields(attributes, attributeId, newPrefix)
        }

        // Only include boolean fields since we're doing boolean comparisons
        if (attribute.type === 'boolean') {
          return [
            {
              key: prefix ? `${prefix}.${attribute.key}` : attribute.key,
              value: attributeId,
            },
          ]
        }
        return []
      })
    },
    [],
  )

  const availableAttributes = useMemo(() => {
    if (!modelAttributes) return []

    const flatAttributes = flattenSchemaFields(modelAttributes)
    return flatAttributes.map(({ key, value }) => ({
      label: key,
      value: value,
    }))
  }, [modelAttributes, flattenSchemaFields])

  const handleAddCondition = () => {
    if (availableAttributes.length === 0) return

    const defaultCondition = {
      attributeId: availableAttributes[0].value,
      operator: 'equal-to',
      value: 0,
    }

    const updatedConditions = [...conditions, defaultCondition]
    setConditions(updatedConditions as BooleanCondition[])
  }

  const handleRemoveCondition = (conditionIndex: number) => {
    const updatedConditions = conditions.filter((_condition, i) => {
      if (conditionIndex === i) return false
      return true
    })

    setConditions(updatedConditions as BooleanCondition[])
  }

  const handleConditionFieldChange = (selectedValue: string, conditionIndex: number) => {
    const attributeId = selectedValue

    const updatedConditions = [...conditions]
    updatedConditions[conditionIndex] = {
      ...updatedConditions[conditionIndex],
      attributeId,
    }

    setConditions(updatedConditions)
  }

  const handleConditionOperatorChange = (selectedValue: string, conditionIndex: number) => {
    const operator = selectedValue

    const updatedConditions = [...conditions]

    updatedConditions[conditionIndex] = {
      ...updatedConditions[conditionIndex],
      operator: operator as 'equal-to',
    }

    setConditions(updatedConditions)
  }

  const handleConditionValueChange = (selectedValue: string, conditionIndex: number) => {
    const value = selectedValue === 'true'

    const updatedConditions = [...conditions]

    updatedConditions[conditionIndex] = {
      ...updatedConditions[conditionIndex],
      value,
    }

    setConditions(updatedConditions)
  }

  if (!model) {
    return (
      <Modal id="booleanConditions" title="Boolean conditions" showAccept={false}>
        Missing model. Make sure you set a model before trying to apply a threshold.
      </Modal>
    )
  }

  return (
    <Modal id="booleanConditions" title="Boolean conditions" showAccept={false}>
      <div className="overflow-scroll">
        {availableAttributes.length <= 0 && (
          <p>
            No boolean attributes were found in the '{model.name}' model.{' '}
            <a
              className="text-blue-500 underline"
              href={`/organizations/${orgId}/spaces/${spaceId}/models/${model.id}`}
            >
              Add at least one boolean field
            </a>{' '}
            and then try again.
          </p>
        )}
        {availableAttributes.length > 0 && (
          <>
            {conditions.map((condition, index) => {
              // Find the display label for the current attributeId
              const attributeOption = availableAttributes.find(
                (a) => a.value === condition.attributeId,
              )
              const attributeLabel = attributeOption?.label || condition.attributeId

              return (
                <div
                  key={`${attributeLabel}-${index}`}
                  id={`${attributeLabel}-${index}`}
                  className="relative"
                >
                  <XIcon
                    size="1em"
                    className="absolute top-1 right-0 cursor-pointer"
                    onClick={() => handleRemoveCondition(index)}
                  />
                  <h2 className="text-xs mb-1 mt-2">Condition {index + 1}</h2>
                  <div className="border border-green-500 rounded-sm px-6 py-3">
                    <Field className="my-3">
                      <FieldLabel htmlFor={`condition${index}.field`}>Field</FieldLabel>
                      <Select
                        name={`condition${index}.field`}
                        value={condition.attributeId}
                        onValueChange={(value) => handleConditionFieldChange(value, index)}
                      >
                        <SelectTrigger id={`condition${index}.field`} className="w-full">
                          <SelectValue placeholder="Select an option" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableAttributes.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field className="my-3">
                      <FieldLabel htmlFor={`condition${index}.operator`}>Operator</FieldLabel>
                      <Select
                        name={`condition${index}.operator`}
                        value={condition.operator}
                        onValueChange={(value) => handleConditionOperatorChange(value, index)}
                      >
                        <SelectTrigger id={`condition${index}.operator`} className="w-full">
                          <SelectValue placeholder="Select an option" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="equal-to">==</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field className="my-3">
                      <FieldLabel htmlFor={`condition${index}.value`}>Value</FieldLabel>
                      <Select
                        name={`condition${index}.value`}
                        value={condition.value.toString()}
                        onValueChange={(value) => handleConditionValueChange(value, index)}
                      >
                        <SelectTrigger id={`condition${index}.value`} className="w-full">
                          <SelectValue placeholder="Select an option" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="true">True</SelectItem>
                          <SelectItem value="false">False</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                  </div>
                </div>
              )
            })}
          </>
        )}
      </div>
      <Button
        onClick={handleAddCondition}
        className="mb-2 w-full"
        disabled={availableAttributes.length === 0}
      >
        Add condition
      </Button>
    </Modal>
  )
}

export default BooleanConditionalOptions
