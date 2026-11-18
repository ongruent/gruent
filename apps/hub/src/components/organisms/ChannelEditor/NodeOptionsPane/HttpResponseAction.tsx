import useChannelEditorStore from '@gruent/hub/stores/channelEditorStore'
import { ChannelNode } from '@gruent/libs/legacy/engine/nodes/v1'
import { HttpResponseActionNodeConfig } from '@gruent/libs/engine/nodes/v1/src/action/httpResponse'
import { Thing } from '@prisma/client'
import { FC, useEffect, useState } from 'react'
import { Field, FieldLabel } from '@gruent/libs/frontend/components/core/field'
import { Input } from '@gruent/libs/frontend/components/core/input'

type Props = {
  things: Thing[]
  orgId: string
  spaceId: string
}

const HttpResponseActionOptions: FC<Props> = ({ things }) => {
  const upsertNode = useChannelEditorStore((state) => state.upsertNode)
  const currentNode = useChannelEditorStore(
    (state) => state.currentNode as ChannelNode<HttpResponseActionNodeConfig>,
  )

  const [selectedResponseCode, setSelectedResponseCode] = useState<number>()
  const [selectedResponseHeaders, setSelectedResponseHeaders] = useState<Record<string, string>>()
  // const [selectedResponseBody, setSelectedResponseBody] = useState<string>()

  // Load in default values
  useEffect(() => {
    const currentConfig = { ...currentNode.metadata.config }
    if (!things) return

    setSelectedResponseCode(currentConfig.responseCode)
    setSelectedResponseHeaders(currentConfig.headers)
  }, [currentNode, things])

  // Update config and dependencies when options have been updated
  useEffect(() => {
    if (!selectedResponseCode) return
    if (!selectedResponseHeaders) return

    // Update config
    const updatedNode = structuredClone(currentNode)

    updatedNode.metadata.config = {
      responseCode: selectedResponseCode,
      headers: selectedResponseHeaders,
    }

    // Apply updates to the nodes map
    upsertNode(currentNode.id, updatedNode)

    // eslint-disable-next-line -- currentNode in the dependencies array causes node configs to sometimes be copied
  }, [selectedResponseCode, selectedResponseHeaders, upsertNode])

  return (
    <>
      <Field className="my-3 w-full">
        <FieldLabel htmlFor="responseCode">Response Code</FieldLabel>
        <Input
          id="responseCode"
          name="responseCode"
          type="number"
          value={selectedResponseCode?.toString()}
          onChange={(e) => setSelectedResponseCode(Number(e.target.value))}
          autoComplete="off"
          spellCheck={false}
        />
      </Field>
    </>
  )
}

export default HttpResponseActionOptions
