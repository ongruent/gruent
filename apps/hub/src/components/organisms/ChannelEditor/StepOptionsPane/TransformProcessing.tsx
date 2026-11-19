import useChannelEditorStore from '@gruent/hub/stores/channelEditorStore'
import Modal from '@gruent/libs/frontend/components/Modal'
import { openModal } from '@gruent/libs/frontend/hooks/useModal'
import { ChannelNode, TransformNodeConfig } from '@gruent/libs/legacy/engine/nodes/v1'
import { Model } from '@prisma/client'
import { Dispatch, FC, SetStateAction, useCallback, useEffect, useMemo, useState } from 'react'
import { ModelAttributes } from '@gruent/libs/engine/dependencies/models'
import { ArrowLeftIcon, PlusIcon } from 'lucide-react'
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

const TransformProcessingOptions: FC<Props> = ({ models, orgId, spaceId }) => {
  const upsertStep = useChannelEditorStore((state) => state.upsertStep)
  const currentStep = useChannelEditorStore(
    (state) => state.currentStep as ChannelNode<TransformNodeConfig>,
  )

  const [inputModel, setInputModel] = useState<Model>()
  const [outputModel, setOutputModel] = useState<Model>()
  const [transformation, setTransformation] = useState<Map<string, string>>(new Map())

  // load in default values
  useEffect(() => {
    const currentConfig = { ...currentStep.metadata.config }
    if (!models || models.length <= 0) return

    const im = models.find((model) => {
      if (model.id === currentConfig['inputModel::model']) return true
      return false
    })

    const om = models.find((model) => {
      if (model.id === currentConfig['outputModel::model']) return true
      return false
    })

    setInputModel(im)
    setOutputModel(om)
    setTransformation(new Map<string, string>(Object.entries(currentConfig.mapping || {})))
  }, [currentStep, models])

  // update config and dependencies when options have been updated
  useEffect(() => {
    if (!inputModel) return
    if (!outputModel) return

    // update config
    const updatedStep = structuredClone(currentStep)
    updatedStep.metadata.config = {
      'inputModel::model': inputModel.id,
      'outputModel::model': outputModel.id,
      mapping: Object.fromEntries(transformation.entries()),
    }

    // update dependencies
    updatedStep.metadata.dependencies.models = [
      {
        modelId: inputModel.id,
        fieldName: 'inputModel::model',
      },
      {
        modelId: outputModel.id,
        fieldName: 'outputModel::model',
      },
    ]

    upsertStep(currentStep.id, updatedStep)

    // eslint-disable-next-line -- currentStep in the dependencies array causes step configs to sometimes be copied
  }, [inputModel, outputModel, transformation, upsertStep])

  // reset the transformation when the models change
  useEffect(() => {
    if (!inputModel || !outputModel) return

    if (
      inputModel.id === currentStep.metadata.config['inputModel::model'] &&
      outputModel.id === currentStep.metadata.config['outputModel::model']
    )
      return

    setTransformation(new Map())
  }, [inputModel, outputModel, currentStep.metadata.config])

  const modelOptions = useMemo(() => {
    if (!models) return []

    return models.map((model) => ({
      label: model.name,
      value: model.id,
    }))
  }, [models])

  if (!models || models.length < 2)
    return (
      <p className="mb-2">
        <Button variant="link" onClick={() => openModal('createModel')}>
          Add at least two models
        </Button>{' '}
        to your space before using this step.
      </p>
    )

  return (
    <>
      <TransformStepModal
        transformation={transformation}
        currentStep={currentStep}
        inputModel={inputModel}
        outputModel={outputModel}
        orgId={orgId}
        spaceId={spaceId}
        setTransformation={setTransformation}
      />
      <div className="flex flex-row items-end gap-2">
        <Field className="my-3 grow">
          <FieldLabel htmlFor="inputModel::model">Input</FieldLabel>
          <Select
            name="inputModel::model"
            value={inputModel ? inputModel.id : ''}
            onValueChange={(value) => setInputModel(models.find((m) => m.id === value))}
          >
            <SelectTrigger id="inputModel::model" className="w-full">
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
          aria-label="Create input model"
          className="my-3"
          onClick={() => openModal('createModel')}
        >
          <PlusIcon />
        </Button>
      </div>
      <div className="flex flex-row items-end gap-2">
        <Field className="my-3 grow">
          <FieldLabel htmlFor="outputModel::model">Output</FieldLabel>
          <Select
            name="outputModel::model"
            value={outputModel ? outputModel.id : ''}
            onValueChange={(value) => setOutputModel(models.find((m) => m.id === value))}
          >
            <SelectTrigger id="outputModel::model" className="w-full">
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
          aria-label="Create output model"
          className="my-3"
          onClick={() => openModal('createModel')}
        >
          <PlusIcon />
        </Button>
      </div>
      <Button className="mt-2" onClick={() => openModal('transform')}>
        Transform your data
      </Button>
    </>
  )
}

type TransformModalProps = {
  transformation: Map<string, string>
  currentStep: ChannelNode
  inputModel?: Model
  outputModel?: Model
  orgId: string
  spaceId: string
  setTransformation: Dispatch<SetStateAction<Map<string, string>>>
}

const TransformStepModal: FC<TransformModalProps> = ({
  transformation,
  inputModel,
  outputModel,
  orgId,
  spaceId,
  setTransformation,
}) => {
  const inputModelSchema: ModelAttributes = useMemo(() => {
    if (inputModel && inputModel.attributes)
      return JSON.parse(inputModel.attributes as string) as ModelAttributes

    return {}
  }, [inputModel])

  const outputModelSchema: ModelAttributes = useMemo(() => {
    if (outputModel && outputModel.attributes)
      return JSON.parse(outputModel.attributes as string) as ModelAttributes

    return {}
  }, [outputModel])

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

        return [
          {
            key: prefix ? `${prefix}.${attribute.key}` : attribute.key,
            value: attributeId,
          },
        ]
      })
    },
    [],
  )

  const inputModelSchemaOptions = useMemo(() => {
    if (!inputModelSchema) return []

    const flatAttributes = flattenModelAttributes(inputModelSchema)
    return flatAttributes.map(({ key, value }) => ({
      label: key,
      value: value,
    }))
  }, [inputModelSchema, flattenModelAttributes])

  const outputAttributes = useMemo(() => {
    if (!outputModelSchema) return []

    return flattenModelAttributes(outputModelSchema)
  }, [outputModelSchema, flattenModelAttributes])

  const handleTransformAttributeChange = (outputKey: string, inputKey: string) => {
    const updatedTransformation = new Map(transformation)
    updatedTransformation.set(inputKey, outputKey)
    if (outputKey === '__GRUENT_IGNORE__') updatedTransformation.delete(inputKey)

    setTransformation(updatedTransformation)
  }

  if (!inputModel || !outputModel) {
    return (
      <Modal id="transform" title="Transform data" showAccept={false}>
        Missing input or output model. Make sure you set these before trying to apply a
        transformation.
      </Modal>
    )
  }

  return (
    <Modal id="transform" title="Transform data" showAccept={false}>
      <div className="space-y-4">
        <h2 className="text-lg">
          {inputModel.name} to {outputModel.name}
        </h2>

        {outputAttributes.length <= 0 && (
          <p>
            No attributes were found in the '{outputModel.name}' model.{' '}
            <a
              className="text-blue-500 underline"
              href={`/organizations/${orgId}/spaces/${spaceId}/models/${outputModel.id}`}
            >
              Add at least one
            </a>{' '}
            and then try again.
          </p>
        )}

        <div className="space-y-2">
          {outputAttributes.map(({ key, value }) => {
            const defaultValue = transformation.get(value) ?? ''

            return (
              <div key={value} className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
                <div className="text-right font-medium">{key}</div>
                <ArrowLeftIcon size="1em" className="text-gray-500" />
                <Field className="my-3">
                  <FieldLabel htmlFor={key} className="sr-only">
                    {key}
                  </FieldLabel>
                  <Select
                    name={key}
                    defaultValue={defaultValue}
                    onValueChange={(selected) => handleTransformAttributeChange(selected, value)}
                  >
                    <SelectTrigger id={key} className="w-full">
                      <SelectValue placeholder="Select an option" />
                    </SelectTrigger>
                    <SelectContent>
                      {inputModelSchemaOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            )
          })}
        </div>
      </div>
    </Modal>
  )
}

export default TransformProcessingOptions
