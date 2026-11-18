import useChannelEditorStore from '@gruent/hub/stores/channelEditorStore'
import { ChannelNode, MetricActionNodeConfig } from '@gruent/libs/legacy/engine/nodes/v1'
import { Model, Thing } from '@prisma/client'
import { FC, useEffect, useMemo, useState } from 'react'
import { PlusIcon } from 'lucide-react'
import { openModal } from '@gruent/libs/frontend/hooks/useModal'
import { ModelAttributes } from '@gruent/libs/engine/dependencies/models'
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
  things: Thing[]
  orgId: string
  spaceId: string
}

const MetricAction: FC<Props> = ({ models, things }) => {
  const upsertNode = useChannelEditorStore((state) => state.upsertNode)
  const currentNode = useChannelEditorStore(
    (state) => state.currentNode as ChannelNode<MetricActionNodeConfig>,
  )

  const [selectedModel, setSelectedModel] = useState<Model>()
  const [selectedClickhouse, setSelectedClickhouse] = useState<Thing>()
  const [selectedAttribute, setSelectedAttribute] = useState<string>()
  const [selectedMetadata, setSelectedMetadata] = useState<string>()

  // Debug log for things array
  useEffect(() => {
    console.log('All things:', things)
    console.log(
      'Things categories:',
      things?.map((t) => ({ id: t.id, name: t.name, category: t.thingCategory })),
    )
  }, [things])

  // Filter for Clickhouse databases
  const clickhouseOptions = useMemo(() => {
    if (!things) return []

    const filtered = things.filter((thing) => {
      console.log('Checking thing:', {
        id: thing.id,
        name: thing.name,
        category: thing.thingCategory,
      })
      return thing.thingCategory === 'CLICKHOUSE_DATABASE'
    })

    console.log('Filtered Clickhouse things:', filtered)

    return filtered.map((thing) => ({
      label: thing.name,
      value: thing.id,
    }))
  }, [things])

  // Get numeric fields from selected model
  const numericAttributeOptions = useMemo(() => {
    if (!selectedModel?.attributes) return []

    const attributes = JSON.parse(selectedModel.attributes as string) as ModelAttributes
    console.log('Model attributes:', attributes)

    return Object.entries(attributes)
      .filter(([_, attr]) => attr.type === 'number')
      .map(([id, attr]) => ({
        label: attr.key,
        value: id,
      }))
  }, [selectedModel])

  // Get metadata fields (string, number, or boolean) from selected model
  const metadataOptions = useMemo(() => {
    if (!selectedModel?.attributes) return []

    const attributes = JSON.parse(selectedModel.attributes as string) as ModelAttributes
    return Object.entries(attributes)
      .filter(([_, attr]) => ['string', 'number', 'boolean'].includes(attr.type))
      .map(([id, attr]) => ({
        label: attr.key,
        value: id,
      }))
  }, [selectedModel])

  // load in default values
  useEffect(() => {
    const currentConfig = { ...currentNode.metadata.config }
    console.log('Current config:', currentConfig)

    if (!models || models.length <= 0) return

    const model = models.find((model) => {
      if (model.id === currentConfig.model) return true
      return false
    })

    const clickhouse = things?.find(
      (thing) => thing.id === currentConfig['clickhouseDatabase::thing'],
    )
    console.log('Found clickhouse:', clickhouse)

    setSelectedModel(model)
    setSelectedClickhouse(clickhouse)
    setSelectedAttribute(currentConfig.attribute)
    setSelectedMetadata(currentConfig.metadata)
  }, [currentNode, models, things])

  // update config and dependencies when options have been updated
  useEffect(() => {
    if (!selectedModel || !selectedClickhouse || !selectedAttribute || !selectedMetadata) return

    // update config
    const updatedNode = structuredClone(currentNode)
    updatedNode.metadata.config = {
      model: selectedModel.id,
      'clickhouseDatabase::thing': selectedClickhouse.id,
      attribute: selectedAttribute,
      metadata: selectedMetadata,
    }

    // update dependencies
    updatedNode.metadata.dependencies = {
      models: [
        {
          modelId: selectedModel.id,
          fieldName: 'model',
        },
      ],
      things: [
        {
          thingId: selectedClickhouse.id,
          fieldName: 'clickhouseDatabase::thing',
          internal: false,
        },
      ],
    }

    upsertNode(currentNode.id, updatedNode)
  }, [selectedModel, selectedClickhouse, selectedAttribute, selectedMetadata, upsertNode])

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

  if (!clickhouseOptions || clickhouseOptions.length <= 0)
    return (
      <p className="mb-2">
        <Button variant="link" onClick={() => openModal('createThing')}>
          Add a Clickhouse database
        </Button>{' '}
        to your space before using this node.
      </p>
    )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-row items-end gap-2">
        <Field className="my-3 grow">
          <FieldLabel htmlFor="model">Model</FieldLabel>
          <Select
            name="model"
            value={selectedModel ? selectedModel.id : ''}
            onValueChange={(value) => setSelectedModel(models.find((m) => m.id === value))}
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
      {selectedModel && numericAttributeOptions.length > 0 && (
        <Field className="my-3">
          <FieldLabel htmlFor="attribute">Value</FieldLabel>
          <Select
            name="attribute"
            value={selectedAttribute || ''}
            onValueChange={(value) => setSelectedAttribute(value)}
          >
            <SelectTrigger id="attribute" className="w-full">
              <SelectValue placeholder="Select an option" />
            </SelectTrigger>
            <SelectContent>
              {numericAttributeOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}
      {selectedModel && numericAttributeOptions.length === 0 && (
        <p className="text-sm text-red-500">
          No numeric attributes found in this model. Add at least one numeric attribute to use it
          for metrics.
        </p>
      )}
      {selectedModel && !selectedAttribute && numericAttributeOptions.length > 0 && (
        <p className="text-sm text-red-500">Please select a value attribute for the metric.</p>
      )}
      {selectedModel && metadataOptions.length > 0 && (
        <Field className="my-3">
          <FieldLabel htmlFor="metadata">Metadata</FieldLabel>
          <Select
            name="metadata"
            value={selectedMetadata || ''}
            onValueChange={(value) => setSelectedMetadata(value)}
          >
            <SelectTrigger id="metadata" className="w-full">
              <SelectValue placeholder="Select an option" />
            </SelectTrigger>
            <SelectContent>
              {metadataOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}
      {selectedModel && metadataOptions.length === 0 && (
        <p className="text-sm text-red-500">
          No suitable attributes found for metadata. Add at least one string, number, or boolean
          attribute.
        </p>
      )}
      {selectedModel && !selectedMetadata && metadataOptions.length > 0 && (
        <p className="text-sm text-red-500">Please select a metadata attribute.</p>
      )}
      <Field className="my-3">
        <FieldLabel htmlFor="clickhouseDatabase">Clickhouse Database</FieldLabel>
        <Select
          name="clickhouseDatabase"
          value={selectedClickhouse ? selectedClickhouse.id : ''}
          onValueChange={(value) =>
            setSelectedClickhouse(
              things.find((s) => {
                if (s.id === value) return true
                return false
              }),
            )
          }
        >
          <SelectTrigger id="clickhouseDatabase" className="w-full">
            <SelectValue placeholder="Select an option" />
          </SelectTrigger>
          <SelectContent>
            {clickhouseOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      {!selectedClickhouse && (
        <p className="text-sm text-red-500">Please select a Clickhouse database.</p>
      )}
    </div>
  )
}

export default MetricAction
