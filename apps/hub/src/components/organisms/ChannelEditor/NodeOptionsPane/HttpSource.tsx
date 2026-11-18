import useChannelEditorStore from '@gruent/hub/stores/channelEditorStore'
import { ChannelNode, ChannelNodeConfig, defaultNodes } from '@gruent/libs/legacy/engine/nodes/v1'
import { HttpMethod } from '@gruent/libs/legacy/engine/nodes/v1/src/action/http'
import { HttpSourceNodeConfig } from '@gruent/libs/legacy/engine/nodes/v1/src/source/http'
import { FC, useEffect, useState } from 'react'
import NodeLibrarySectionNode from '../NodeLibraryPane/NodeLibrarySectionNode'
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
  channelId: string
}

const HttpSourceOptions: FC<Props> = ({ channelId }) => {
  const upsertNode = useChannelEditorStore((state) => state.upsertNode)
  const currentNode = useChannelEditorStore(
    (state) => state.currentNode as ChannelNode<HttpSourceNodeConfig>,
  )

  const [selectedMethod, setSelectedMethod] = useState<HttpMethod>(
    (currentNode.metadata.config.method as HttpMethod) || HttpMethod.GET,
  )
  const [responseTimeout, setResponseTimeout] = useState<number>(
    currentNode.metadata.config.responseTimeout || 10,
  )

  // load in default values
  useEffect(() => {
    const currentConfig = { ...currentNode.metadata.config }

    setSelectedMethod((currentConfig.method as HttpMethod) || HttpMethod.GET)
  }, [currentNode])

  // update config and dependencies when options have been updated
  useEffect(() => {
    if (!selectedMethod) return

    // update config
    const updatedNode = structuredClone(currentNode)
    updatedNode.metadata.config = {
      'httpServer::thing': channelId,
      method: selectedMethod,
      responseTimeout,
    }

    // update dependencies array
    let httpServerThingDependencyIndex = updatedNode.metadata.dependencies.things.findIndex(
      (d) => d.fieldName && d.fieldName === 'httpServer::thing',
    )
    if (httpServerThingDependencyIndex < 0)
      httpServerThingDependencyIndex = updatedNode.metadata.dependencies.things.length

    updatedNode.metadata.dependencies.things[httpServerThingDependencyIndex] = {
      fieldName: 'httpServer::thing',
      internal: true,
      thingId: channelId,
    }

    upsertNode(currentNode.id, updatedNode)

    // eslint-disable-next-line -- currentNode in the dependencies array causes node configs to sometimes be copied
  }, [selectedMethod, responseTimeout, channelId, upsertNode])

  return (
    <>
      <Field className="my-3">
        <FieldLabel htmlFor="method">Method</FieldLabel>
        <Select
          name="method"
          value={selectedMethod}
          onValueChange={(value) => setSelectedMethod(value as HttpMethod)}
        >
          <SelectTrigger id="method" className="w-full">
            <SelectValue placeholder="Select an option" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={HttpMethod.GET}>{HttpMethod.GET}</SelectItem>
            <SelectItem value={HttpMethod.POST}>{HttpMethod.POST}</SelectItem>
            <SelectItem value={HttpMethod.PUT}>{HttpMethod.PUT}</SelectItem>
            <SelectItem value={HttpMethod.DELETE}>{HttpMethod.DELETE}</SelectItem>
            <SelectItem value={HttpMethod.HEAD}>{HttpMethod.HEAD}</SelectItem>
            <SelectItem value={HttpMethod.PATCH}>{HttpMethod.PATCH}</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field className="my-3">
        <FieldLabel htmlFor="responseTimeout">Response Timeout</FieldLabel>
        <Input
          id="responseTimeout"
          name="responseTimeout"
          type="number"
          min="1"
          max="30"
          value={responseTimeout.toString()}
          onChange={(e) => setResponseTimeout(parseInt(e.target.value))}
          autoComplete="off"
          spellCheck={false}
        />
      </Field>
      <NodeLibrarySectionNode
        label="HTTP Response-action"
        defaultNode={defaultNodes.get('HTTP Response-action') as ChannelNode<ChannelNodeConfig>}
      />
    </>
  )
}

export default HttpSourceOptions
