'use client'

import { Button } from '@gruent/libs/frontend/components/core/button'
import { Checkbox } from '@gruent/libs/frontend/components/core/checkbox'
import { Field, FieldLabel } from '@gruent/libs/frontend/components/core/field'
import { Input } from '@gruent/libs/frontend/components/core/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@gruent/libs/frontend/components/core/select'
import gruentClient from '@gruent/hub/lib/gruent'
import { addToast } from '@gruent/libs/frontend/hooks/useToast'
import { ChevronDownIcon, ChevronRightIcon, GripVerticalIcon, XIcon } from 'lucide-react'
import { Model } from '@prisma/client'
import { useMutation } from '@tanstack/react-query'
import { FC, FormEventHandler, useCallback, useEffect, useMemo, useState, useRef } from 'react'
import { generateModelAttributeId } from '@gruent/hub/util/idGenerator'
import { ModelAttribute, ModelAttributes } from '@gruent/libs/engine/dependencies/models'
import useAuth from '@gruent/hub/hooks/useAuth'

// Add interface for the ref
export interface ModelSettingsFormRef {
  getAttributes: () => ModelAttributes
  reset: () => void
}

type Props = {
  spaceId: string
  initialModel?: Partial<Model>
  showSaveButton?: boolean
  onSubmit?: (attributes: ModelAttributes, name: string) => void
  attributes?: ModelAttributes
  setAttributes?: (
    attributesOrUpdater: ModelAttributes | ((prev: ModelAttributes) => ModelAttributes),
  ) => void
  name?: string
  setName?: (name: string) => void
}

const AttributeRow: FC<{
  attribute: ModelAttribute
  level: number
  onUpdate: (updated: ModelAttribute) => void
  onDelete: () => void
  renderAttributes: (parentId: string | null, level: number) => React.ReactNode
  onReorder?: (draggedId: string, targetId: string, position: 'before' | 'after') => void
}> = ({ attribute, level, onUpdate, onDelete, renderAttributes, onReorder }) => {
  const [showAttributeOptions, setShowAttributeOptions] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [dropPosition, setDropPosition] = useState<'before' | 'after' | null>(null)
  const rowRef = useRef<HTMLDivElement>(null)

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    setIsDragging(true)
    e.dataTransfer.setData('text/plain', attribute.id)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragEnd = () => {
    setIsDragging(false)
    setDropPosition(null)
  }

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'

    const rect = rowRef.current?.getBoundingClientRect()
    if (!rect) return

    const dropY = e.clientY
    const position = dropY < rect.top + rect.height / 2 ? 'before' : 'after'
    setDropPosition(position)
  }

  const handleDragLeave = () => {
    setDropPosition(null)
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    const draggedId = e.dataTransfer.getData('text/plain')
    if (draggedId === attribute.id) return

    const rect = rowRef.current?.getBoundingClientRect()
    if (!rect) return

    const dropY = e.clientY
    const position = dropY < rect.top + rect.height / 2 ? 'before' : 'after'

    if (onReorder) onReorder(draggedId, attribute.id, position)
    setDropPosition(null)
  }

  // Recursive function to render array object attributes
  const renderArrayObjectAttributes = (attribute: ModelAttribute, currentLevel: number) => {
    if (attribute.type !== 'array' || attribute.subtype !== 'object') return null

    // Get attributes without a parentId first (top level attributes)
    const topLevelAttributes = Object.entries(attribute.arrayObjectAttributes || {}).filter(
      ([_, subAttribute]) => !subAttribute.parentId,
    )

    // Get child attributes for a given parent
    const getChildAttributes = (parentId: string) =>
      Object.entries(attribute.arrayObjectAttributes || {}).filter(
        ([_, subAttribute]) => subAttribute.parentId === parentId,
      )

    // Recursive function to render a attribute and all its children
    const renderAttributeWithChildren = (
      id: string,
      subAttribute: ModelAttribute,
      level: number,
    ) => (
      <div key={id}>
        <AttributeRow
          attribute={subAttribute}
          level={level}
          renderAttributes={renderAttributes}
          onUpdate={(updated) => {
            onUpdate({
              ...attribute,
              arrayObjectAttributes: {
                ...(attribute.arrayObjectAttributes || {}),
                [id]: updated,
              },
            })
          }}
          onDelete={() => {
            const { [id]: _, ...remainingAttributes } = attribute.arrayObjectAttributes || {}
            onUpdate({
              ...attribute,
              arrayObjectAttributes: remainingAttributes,
            })
          }}
          onReorder={onReorder}
        />
        {/* Recursively render child attributes if this is an object */}
        {subAttribute.type === 'object' && (
          <div className="ml-4">
            {getChildAttributes(id).map(([childId, childAttribute]) => (
              <div key={childId} className="border-l-2 border-gray-200 pl-4">
                {renderAttributeWithChildren(childId, childAttribute, level + 1)}
              </div>
            ))}
            <Button
              className="w-full mb-4"
              onClick={() => {
                const newNestedAttribute: ModelAttribute = {
                  id: generateModelAttributeId(),
                  key: '',
                  type: 'string',
                  required: true,
                  protected: false,
                  parentId: id,
                }
                onUpdate({
                  ...attribute,
                  arrayObjectAttributes: {
                    ...(attribute.arrayObjectAttributes || {}),
                    [newNestedAttribute.id]: newNestedAttribute,
                  },
                })
              }}
            >
              Add nested field
            </Button>
          </div>
        )}
      </div>
    )

    return (
      <div className="mt-4 border-l-2 border-gray-200 pl-4">
        <h4 className="text-sm font-medium mb-2">Array Item Structure</h4>
        {topLevelAttributes.map(([id, subAttribute]) =>
          renderAttributeWithChildren(id, subAttribute, currentLevel + 1),
        )}
        <Button
          className="w-full mb-4"
          onClick={() => {
            const order = Object.values(attribute.arrayObjectAttributes || {}).length

            const newAttribute: ModelAttribute = {
              id: generateModelAttributeId(),
              key: '',
              type: 'string',
              required: true,
              protected: false,
              order,
            }
            onUpdate({
              ...attribute,
              arrayObjectAttributes: {
                ...(attribute.arrayObjectAttributes || {}),
                [newAttribute.id]: newAttribute,
              },
            })
          }}
        >
          Add attribute to array item
        </Button>
      </div>
    )
  }

  return (
    <>
      {dropPosition === 'before' && (
        <div className="h-0.5 bg-blue-500 my-2 transition-all duration-200" />
      )}
      <div
        ref={rowRef}
        draggable
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`flex ${isDragging ? 'opacity-50' : ''}`}
      >
        <div className="mb-4">
          <div className="flex items-center relative">
            <GripVerticalIcon
              size="1em"
              className="-ml-5 mr-1 mt-2 transition cursor-grab text-gray-500 hover:text-gray-600 dark:hover:text-gray-400"
            />
            <XIcon
              size="1em"
              className="absolute top-1/2 -translate-y-1/4 -right-5 transition cursor-pointer text-red-500 hover:text-red-600 dark:hover:text-red-400"
              onClick={onDelete}
            />
            <Field className="mt-3 grow mb-0 min-w-[300px] mr-4">
              <FieldLabel htmlFor={`key-${attribute.id}`}>Key</FieldLabel>
              <Input
                id={`key-${attribute.id}`}
                name={`key-${attribute.id}`}
                value={attribute.key || ''}
                onChange={(e) => {
                  const updatedAttribute = { ...attribute, key: e.target.value }
                  onUpdate(updatedAttribute)
                }}
                autoComplete="off"
                spellCheck={false}
              />
            </Field>
            <Field className="mt-3 grow mb-0">
              <FieldLabel htmlFor={`value-${attribute.id}`}>Value</FieldLabel>
              <Select
                name="value"
                value={attribute.type ?? ''}
                onValueChange={(value) => {
                  const newType = value as ModelAttribute['type']
                  onUpdate({
                    ...attribute,
                    type: newType,
                    subtype: newType === 'array' ? 'string' : undefined,
                  })
                }}
              >
                <SelectTrigger id={`value-${attribute.id}`} className="w-full">
                  <SelectValue placeholder="Select an option" />
                </SelectTrigger>
                <SelectContent>
                  {[
                    { label: 'String', value: 'string' },
                    { label: 'Boolean', value: 'boolean' },
                    { label: 'Number', value: 'number' },
                    { label: 'Object', value: 'object' },
                    { label: 'Array', value: 'array' },
                  ].map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          {attribute.type === 'array' && (
            <Field className="mt-3 grow mb-0">
              <FieldLabel htmlFor={`subtype-${attribute.id}`}>Array Type</FieldLabel>
              <Select
                name="subtype"
                value={attribute.subtype || 'string'}
                onValueChange={(value) =>
                  onUpdate({
                    ...attribute,
                    subtype: value as ModelAttribute['subtype'],
                  })
                }
              >
                <SelectTrigger id={`subtype-${attribute.id}`} className="w-full">
                  <SelectValue placeholder="Select an option" />
                </SelectTrigger>
                <SelectContent>
                  {[
                    { label: 'String', value: 'string' },
                    { label: 'Boolean', value: 'boolean' },
                    { label: 'Number', value: 'number' },
                    { label: 'Object', value: 'object' },
                  ].map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
          <span
            className="mt-1 flex items-center transition text-gray-500 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-sm select-none cursor-pointer"
            onClick={() => setShowAttributeOptions(!showAttributeOptions)}
          >
            Options
            {showAttributeOptions ? (
              <ChevronDownIcon size="1em" />
            ) : (
              <ChevronRightIcon size="1em" />
            )}
          </span>
          {showAttributeOptions && (
            <div className="flex gap-2 text-gray-700 dark:text-gray-300">
              <Field orientation="horizontal" className="w-fit">
                <Checkbox
                  id={`${attribute.id}_required`}
                  name={`${attribute.id}_required`}
                  value="true"
                  checked={attribute.required}
                  onCheckedChange={(checked) =>
                    onUpdate({ ...attribute, required: checked === true })
                  }
                />
                <FieldLabel htmlFor={`${attribute.id}_required`} className="font-normal">
                  Required
                </FieldLabel>
              </Field>
              <Field orientation="horizontal" className="w-fit">
                <Checkbox
                  id={`${attribute.id}_protected`}
                  name={`${attribute.id}_protected`}
                  value="true"
                  checked={attribute.protected}
                  onCheckedChange={(checked) =>
                    onUpdate({ ...attribute, protected: checked === true })
                  }
                />
                <FieldLabel htmlFor={`${attribute.id}_protected`} className="font-normal">
                  Protected
                </FieldLabel>
              </Field>
            </div>
          )}

          {attribute.type === 'array' &&
            attribute.subtype === 'object' &&
            renderArrayObjectAttributes(attribute, level)}
        </div>
      </div>
      {dropPosition === 'after' && (
        <div className="h-0.5 bg-blue-500 my-2 transition-all duration-200" />
      )}
    </>
  )
}

const ModelSettingsForm: FC<Props> = ({
  spaceId,
  initialModel,
  showSaveButton = true,
  onSubmit,
  attributes: externalAttributes,
  setAttributes: setExternalAttributes,
  name: externalName,
  setName: setExternalName,
}) => {
  const [internalAttributes, setInternalAttributes] = useState<ModelAttributes>({})
  const [internalName, setInternalName] = useState(initialModel?.name ?? '')

  const { accessToken } = useAuth()

  // Use either external or internal state
  const attributes = useMemo(
    () => externalAttributes ?? internalAttributes,
    [externalAttributes, internalAttributes],
  )
  const setAttributes = useMemo(
    () => setExternalAttributes ?? setInternalAttributes,
    [setExternalAttributes, setInternalAttributes],
  )
  const name = useMemo(() => externalName ?? internalName, [externalName, internalName])
  const setName = useMemo(
    () => setExternalName ?? setInternalName,
    [setExternalName, setInternalName],
  )

  useEffect(() => {
    if (!initialModel) {
      setAttributes({})
      return
    }

    const attributes = (() => {
      if (typeof initialModel.attributes === 'string')
        return JSON.parse(initialModel.attributes as string)

      return initialModel.attributes
    })()

    setAttributes(attributes)
  }, [initialModel, setAttributes])

  const updateModelMutation = useMutation({
    mutationKey: ['updateModel', initialModel?.id],
    mutationFn: async (model: Model) => {
      if (!accessToken) return
      if (!attributes) return

      const { errors } = await gruentClient(accessToken).models.update(spaceId, model)

      if (errors && errors.length > 0) {
        addToast({
          title: 'Could not update the model',
          body: errors[0],
          level: 'error',
        })

        return errors[0]
      }

      addToast({
        title: 'Successfully updated the model',
        body: 'Your new settings have been saved.',
        level: 'success',
      })

      return
    },
  })

  const handleSubmit: FormEventHandler<HTMLFormElement> = useCallback(
    (e) => {
      e.preventDefault()
      if (onSubmit) {
        onSubmit(attributes, name)
        return
      }
      if (initialModel) updateModelMutation.mutate({ ...initialModel, name, attributes } as Model)
    },
    [updateModelMutation, initialModel, name, attributes, onSubmit],
  )

  const handleReorder = useCallback(
    (draggedId: string, targetId: string, position: 'before' | 'after') => {
      setAttributes((current: ModelAttributes) => {
        if (!current) return current

        const draggedAttribute = current[draggedId]
        const targetAttribute = current[targetId]

        // Get all attributes with the same parentId, excluding the dragged attribute
        const siblings = Object.values(current)
          .filter((attr) => {
            if (attr.parentId === draggedAttribute.parentId) return true
            if (!attr.parentId && !draggedAttribute.parentId) return true
            return false
          })
          .filter((attr) => attr.id !== draggedId)
          .sort((a, b) => {
            // If both have order, sort by order
            if (a.order !== undefined && b.order !== undefined) {
              return a.order - b.order
            }
            // If only a has order, it comes first
            if (a.order !== undefined) return -1
            // If only b has order, it comes first
            if (b.order !== undefined) return 1
            // If neither has order, sort alphabetically by key
            return (a.key || '').localeCompare(b.key || '')
          })

        // Calculate the dragged attribute's new order
        const targetOrder = targetAttribute.order ?? 0
        const newOrder =
          position === 'before' ? targetOrder : Math.min(targetOrder, siblings.length)

        // Create a new array of siblings with the dragged item in its new position
        siblings.splice(newOrder, 0, draggedAttribute)

        // Update all attributes with new sequential orders
        const updatedAttributes = { ...current }
        let index = 0 // used instead of forEach index to prevent order numbers from exceeding siblings.length
        siblings.forEach((attr) => {
          updatedAttributes[attr.id] = {
            ...attr,
            order: index,
          }
          index++
        })

        return updatedAttributes
      })
    },
    [setAttributes],
  )

  const renderAttributes = (parentId: string | null = null, level: number = 0) => {
    const attributesToRender = Object.values(attributes).filter((attribute) => {
      // Check if the attribute is a top level attribute
      if (parentId === null) {
        return !attribute.parentId || attribute.parentId === '' || attribute.parentId === null
      }

      // Check for attributes that have this parentId
      return attribute.parentId === parentId
    })

    return attributesToRender
      .sort((a, b) => {
        // If both have order, sort by order
        if (a.order !== undefined && b.order !== undefined) {
          return a.order - b.order
        }
        // If only a has order, it comes first
        if (a.order !== undefined) return -1
        // If only b has order, it comes first
        if (b.order !== undefined) return 1
        // If neither has order, sort alphabetically by key
        return (a.key || '').localeCompare(b.key || '')
      })
      .map((attribute) => (
        <div
          key={attribute.id}
          className={`${level > 0 ? 'transition border-l-2 border-gray-200 hover:border-blue-400 pl-6' : ''}`}
        >
          <AttributeRow
            attribute={attribute}
            level={level}
            onUpdate={(updated) => {
              setAttributes((current: ModelAttributes) => {
                const newSchema = {
                  ...current,
                  [attribute.id]: updated,
                }
                return newSchema
              })
            }}
            onDelete={() => {
              setAttributes((current: ModelAttributes) => {
                if (!current) return current

                // Also remove any child attributes
                const idsToRemove = new Set([attribute.id])
                const getAllChildIds = (parentId: string) => {
                  Object.values(current)
                    .filter((a) => a.parentId === parentId)
                    .forEach((a) => {
                      idsToRemove.add(a.id)
                      getAllChildIds(a.id)
                    })
                }
                getAllChildIds(attribute.id)
                const updatedAttributes: ModelAttributes = {
                  ...current,
                }

                idsToRemove.forEach((id) => {
                  delete updatedAttributes[id]
                })

                return updatedAttributes
              })
            }}
            onReorder={handleReorder}
            renderAttributes={renderAttributes}
          />
          {attribute.type === 'object' && (
            <>
              {renderAttributes(attribute.id, level + 1)}
              <Button
                className={`w-full mb-4 ml-0 ${
                  Object.values(attributes).some((a) => a.parentId === attribute.id) ? 'mt-4' : ''
                }`}
                onClick={() => {
                  setAttributes((current: ModelAttributes) => {
                    const order = Object.values(current).filter(
                      (attr) => attr.parentId === attribute.id,
                    ).length

                    const newAttribute: ModelAttribute = {
                      id: generateModelAttributeId(),
                      key: '',
                      type: 'string',
                      required: true,
                      protected: false,
                      parentId: attribute.id,
                      order,
                    }
                    return {
                      ...current,
                      [newAttribute.id]: newAttribute,
                    }
                  })
                }}
              >
                Add attribute
              </Button>
            </>
          )}
        </div>
      ))
  }

  return (
    <form onSubmit={handleSubmit}>
      <Field className="my-3">
        <FieldLabel htmlFor="modelName">Model Name</FieldLabel>
        <Input
          id="modelName"
          name="modelName"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
      </Field>
      {renderAttributes()}
      <Button
        className="w-full mb-4"
        onClick={() => {
          setAttributes((current: ModelAttributes) => {
            if (!current) return current

            const id = generateModelAttributeId()
            const order = Object.values(current).filter((attr) => !attr.parentId).length

            return {
              ...current,
              [id]: {
                id,
                key: '',
                type: 'string',
                required: true,
                protected: false,
                order,
              },
            }
          })
        }}
      >
        Add attribute
      </Button>
      {showSaveButton && <Button type="submit">Save</Button>}
    </form>
  )
}

export default ModelSettingsForm
