import useChannelEditorStore from '@gruent/hub/stores/channelEditorStore'
import { ChannelNode, ExistenceConditionalNodeConfig } from '@gruent/libs/legacy/engine/nodes/v1'
import { Model } from '@prisma/client'
import { FC, useCallback, useEffect, useMemo, useState } from 'react'
import { ModelAttribute, ModelAttributes } from '@gruent/libs/engine/dependencies/models'
import { openModal } from '@gruent/libs/frontend/hooks/useModal'
import { ChevronDownIcon, PlusIcon } from 'lucide-react'
import { Button } from '@gruent/libs/frontend/components/core/button'
import { Field, FieldLabel } from '@gruent/libs/frontend/components/core/field'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@gruent/libs/frontend/components/core/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@gruent/libs/frontend/components/core/select'

type Props = {
  models: Model[]
}

const ExistenceConditionalOptions: FC<Props> = ({ models }) => {
  const upsertNode = useChannelEditorStore((state) => state.upsertNode)
  const currentNode = useChannelEditorStore(
    (state) => state.currentNode as ChannelNode<ExistenceConditionalNodeConfig>,
  )

  const [model, setModel] = useState<Model>()
  const [attributeIds, setAttributeIds] = useState<string[]>([])

  // load in default values
  useEffect(() => {
    const currentConfig = { ...currentNode.metadata.config }
    if (!models || models.length <= 0) return

    const model = models.find((model) => {
      if (model.id === currentConfig['model::model']) return true
      return false
    })

    setModel(model)
    setAttributeIds(currentConfig.attributeIds || [])
  }, [currentNode, models])

  // update config and dependencies when options have been updated
  useEffect(() => {
    if (!model) return

    // update config
    const updatedNode = structuredClone(currentNode)
    updatedNode.metadata.config = {
      'model::model': model ? model.id : '',
      attributeIds,
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
  }, [model, attributeIds, upsertNode])

  const modelOptions = useMemo(() => {
    if (!models) return []

    return models.map((model) => ({
      label: model.name,
      value: model.id,
    }))
  }, [models])

  const modelSchema: ModelAttributes = useMemo(() => {
    if (model && model.attributes) return JSON.parse(model.attributes as string) as ModelAttributes
    return {}
  }, [model])

  const flattenModelAttributes = useCallback(
    (
      attributes: Record<string, ModelAttribute>,
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

        // Include only optional fields
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

  const availableAttributes = useMemo(() => {
    if (!modelSchema) return []

    const flatAttributes = flattenModelAttributes(modelSchema)
    return flatAttributes.map(({ key, value }) => ({
      label: key,
      value: value,
    }))
  }, [modelSchema, flattenModelAttributes])

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
      {model && (
        <Field className="my-3">
          <FieldLabel htmlFor="modelAttributes">Attributes</FieldLabel>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                id="modelAttributes"
                variant="outline"
                className="w-full justify-between font-normal"
              >
                {attributeIds.length
                  ? availableAttributes
                      .filter((option) => attributeIds.includes(option.value))
                      .map((option) => option.label)
                      .join(', ')
                  : 'Select options'}
                <ChevronDownIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-(--radix-dropdown-menu-trigger-width)">
              {availableAttributes.map((option) => (
                <DropdownMenuCheckboxItem
                  key={option.value}
                  checked={attributeIds.includes(option.value)}
                  onSelect={(e) => e.preventDefault()}
                  onCheckedChange={(checked) => {
                    const selectedOptions = checked
                      ? [...attributeIds, option.value]
                      : attributeIds.filter((id) => id !== option.value)
                    setAttributeIds(selectedOptions.filter((id) => id !== '__GRUENT_IGNORE__'))
                  }}
                >
                  {option.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </Field>
      )}
    </>
  )
}

export default ExistenceConditionalOptions
