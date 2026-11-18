import useChannelEditorStore from '@gruent/hub/stores/channelEditorStore'
import { ChannelNode } from '@gruent/libs/legacy/engine/nodes/v1'
import {
  StringCompareConditionalNodeConfig,
  StringComparison,
  StringComparisonOperator,
} from '@gruent/libs/legacy/engine/nodes/v1/src/conditional/stringCompare'
import { Model } from '@prisma/client'
import {
  ChangeEvent,
  Dispatch,
  FC,
  SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { ModelAttributes } from '@gruent/libs/engine/dependencies/models'
import Modal from '@gruent/libs/frontend/components/Modal'
import { PlusIcon, XIcon } from 'lucide-react'
import { openModal } from '@gruent/libs/frontend/hooks/useModal'
import { Button } from '@gruent/libs/frontend/components/core/button'
import { Field, FieldLabel } from '@gruent/libs/frontend/components/core/field'
import { Input } from '@gruent/libs/frontend/components/core/input'
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

const StringCompareConditionalOptions: FC<Props> = ({ models, orgId, spaceId }) => {
  const upsertNode = useChannelEditorStore((state) => state.upsertNode)
  const currentNode = useChannelEditorStore(
    (state) => state.currentNode as ChannelNode<StringCompareConditionalNodeConfig>,
  )

  const [model, setModel] = useState<Model>()
  const [comparisons, setComparisons] = useState<StringComparison[]>([])

  // load in default values
  useEffect(() => {
    const currentConfig = { ...currentNode.metadata.config }
    if (!models || models.length <= 0) return

    const model = models.find((model) => {
      if (model.id === currentConfig['model::model']) return true
      return false
    })

    setModel(model)
    setComparisons(currentConfig.comparisons || [])
  }, [currentNode, models])

  // update config and dependencies when options have been updated
  useEffect(() => {
    if (!model) return

    // update config
    const updatedNode = structuredClone(currentNode)
    updatedNode.metadata.config = {
      'model::model': model ? model.id : '',
      comparisons,
    }

    // update dependencies
    updatedNode.metadata.dependencies.models = [
      {
        modelId: model.id,
        internal: false,
        fieldName: 'model::model',
      },
    ]

    upsertNode(currentNode.id, updatedNode)

    // eslint-disable-next-line -- currentNode in the dependencies array causes node configs to sometimes be copied
  }, [model, comparisons, upsertNode])

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
        to your space before using this node.
      </p>
    )

  return (
    <>
      <StringCompareNodeModal
        comparisons={comparisons}
        model={model}
        orgId={orgId}
        spaceId={spaceId}
        setComparisons={setComparisons}
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
      <Button onClick={() => openModal('stringCompare')}>Edit conditions</Button>
    </>
  )
}

type StringCompareModalProps = {
  comparisons: StringComparison[]
  model?: Model
  orgId: string
  spaceId: string
  setComparisons: Dispatch<SetStateAction<StringComparison[]>>
}

const StringCompareNodeModal: FC<StringCompareModalProps> = ({
  comparisons,
  model,
  orgId,
  spaceId,
  setComparisons,
}) => {
  const modelAttributes: ModelAttributes = useMemo(() => {
    if (model && model.attributes) return JSON.parse(model.attributes as string) as ModelAttributes
    return {}
  }, [model])

  const flattenModelAttributes = useCallback(
    (
      attributes: ModelAttributes,
      parentId = '',
      prefix = '',
    ): Array<{ key: string; value: string }> => {
      if (!attributes || Object.keys(attributes).length <= 0) return []

      const attributesInObject = Object.entries(attributes).filter(([_attributeId, attribute]) => {
        if (parentId) return attribute.parentId === parentId
        return !attribute.parentId
      })

      return attributesInObject.flatMap(([attributeId, attribute]) => {
        if (attribute.type === 'object') {
          const newPrefix = prefix ? `${prefix}.${attribute.key}` : attribute.key
          return flattenModelAttributes(attributes, attributeId, newPrefix)
        }

        // Only include string fields since we're doing string comparisons
        if (attribute.type === 'string') {
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

    const flatAttributes = flattenModelAttributes(modelAttributes)
    return flatAttributes.map(({ key, value }) => ({
      label: key,
      value: value,
    }))
  }, [modelAttributes, flattenModelAttributes])

  const handleAddComparison = () => {
    if (availableAttributes.length === 0) return

    const defaultComparison = {
      attributeId: availableAttributes[0].value,
      operator: StringComparisonOperator.EqualTo,
      value: '',
    }

    const updatedComparisons = [...comparisons, defaultComparison]
    setComparisons(updatedComparisons as StringComparison[])
  }

  const handleRemoveComparison = (comparisonIndex: number) => {
    const updatedComparisons = comparisons.filter((_comparison, i) => {
      if (comparisonIndex === i) return false
      return true
    })

    setComparisons(updatedComparisons)
  }

  const handleComparisonAttributeChange = (selectedValue: string, comparisonIndex: number) => {
    const attributeId = selectedValue

    const updatedComparisons = [...comparisons]
    updatedComparisons[comparisonIndex] = {
      ...updatedComparisons[comparisonIndex],
      attributeId,
    }

    setComparisons(updatedComparisons)
  }

  const handleComparisonOperatorChange = (selectedValue: string, comparisonIndex: number) => {
    const operator = selectedValue

    const updatedComparisons = [...comparisons]

    updatedComparisons[comparisonIndex] = {
      ...updatedComparisons[comparisonIndex],
      operator: operator as StringComparisonOperator,
    }

    setComparisons(updatedComparisons)
  }

  const handleComparisonValueChange = (
    e: ChangeEvent<HTMLInputElement>,
    comparisonIndex: number,
  ) => {
    const updatedComparisons = [...comparisons]

    updatedComparisons[comparisonIndex] = {
      ...updatedComparisons[comparisonIndex],
      value: e.target.value,
    }

    setComparisons(updatedComparisons)
  }

  if (!model) {
    return (
      <Modal id="stringCompare" title="String comparisons" showAccept={false}>
        Missing model. Make sure you set a model before trying to apply a threshold.
      </Modal>
    )
  }

  return (
    <Modal id="stringCompare" title="String comparisons" showAccept={false}>
      <div className="overflow-scroll">
        {availableAttributes.length <= 0 && (
          <p>
            No string attributes were found in the '{model.name}' model.{' '}
            <a
              className="text-blue-500 underline"
              href={`/organizations/${orgId}/spaces/${spaceId}/models/${model.id}`}
            >
              Add at least one string attribute
            </a>{' '}
            and then try again.
          </p>
        )}
        {availableAttributes.length > 0 && (
          <>
            {comparisons.map((comparison, index) => {
              // Find the display label for the current attributeId
              const attributeOption = availableAttributes.find(
                (a) => a.value === comparison.attributeId,
              )
              const attributeLabel = attributeOption?.label || comparison.attributeId

              return (
                <div
                  key={`${attributeLabel}-${index}`}
                  id={`${attributeLabel}-${index}`}
                  className="relative"
                >
                  <XIcon
                    size="1em"
                    className="absolute top-1 right-0 cursor-pointer"
                    onClick={() => handleRemoveComparison(index)}
                  />
                  <h2 className="text-xs mb-1 mt-2">Condition {index + 1}</h2>
                  <div className="border border-green-500 rounded-sm px-6 py-3">
                    <Field className="my-3">
                      <FieldLabel htmlFor={`comparison${index}.attribute`}>Attribute</FieldLabel>
                      <Select
                        name={`comparison${index}.attribute`}
                        value={comparison.attributeId}
                        onValueChange={(value) => handleComparisonAttributeChange(value, index)}
                      >
                        <SelectTrigger id={`comparison${index}.attribute`} className="w-full">
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
                        value={comparison.operator}
                        onValueChange={(value) => handleComparisonOperatorChange(value, index)}
                      >
                        <SelectTrigger id={`condition${index}.operator`} className="w-full">
                          <SelectValue placeholder="Select an option" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={StringComparisonOperator.EqualTo}>Equals</SelectItem>
                          <SelectItem value={StringComparisonOperator.Contains}>
                            Contains
                          </SelectItem>
                          <SelectItem value={StringComparisonOperator.StartsWith}>
                            Starts with
                          </SelectItem>
                          <SelectItem value={StringComparisonOperator.EndsWith}>
                            Ends with
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field className="my-3">
                      <FieldLabel htmlFor={`comparison${index}.value`}>Value</FieldLabel>
                      <Input
                        id={`comparison${index}.value`}
                        name={`comparison${index}.value`}
                        value={comparison.value.toString()}
                        onChange={(e) => handleComparisonValueChange(e, index)}
                        autoComplete="off"
                        spellCheck={false}
                      />
                    </Field>
                  </div>
                </div>
              )
            })}
          </>
        )}
      </div>
      <Button
        onClick={handleAddComparison}
        className="mb-2 w-full"
        disabled={availableAttributes.length === 0}
      >
        Add condition
      </Button>
    </Modal>
  )
}

export default StringCompareConditionalOptions
