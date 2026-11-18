import useChannelEditorStore from '@gruent/hub/stores/channelEditorStore'
import { ChannelNode } from '@gruent/libs/legacy/engine/nodes/v1'
import { HttpResponseActionNodeConfig } from '@gruent/libs/engine/nodes/v1/src/action/httpResponse'
import { Connection } from '@prisma/client'
import { FC, useEffect, useState } from 'react'
import { Field, FieldLabel } from '@gruent/libs/frontend/components/core/field'
import { Input } from '@gruent/libs/frontend/components/core/input'

type Props = {
  connections: Connection[]
  orgId: string
  spaceId: string
}

const HttpResponseActionOptions: FC<Props> = ({ connections }) => {
  const upsertStep = useChannelEditorStore((state) => state.upsertStep)
  const currentStep = useChannelEditorStore(
    (state) => state.currentStep as ChannelNode<HttpResponseActionNodeConfig>,
  )

  const [selectedResponseCode, setSelectedResponseCode] = useState<number>()
  const [selectedResponseHeaders, setSelectedResponseHeaders] = useState<Record<string, string>>()
  // const [selectedResponseBody, setSelectedResponseBody] = useState<string>()

  // Load in default values
  useEffect(() => {
    const currentConfig = { ...currentStep.metadata.config }
    if (!connections) return

    setSelectedResponseCode(currentConfig.responseCode)
    setSelectedResponseHeaders(currentConfig.headers)
  }, [currentStep, connections])

  // Update config and dependencies when options have been updated
  useEffect(() => {
    if (!selectedResponseCode) return
    if (!selectedResponseHeaders) return

    // Update config
    const updatedStep = structuredClone(currentStep)

    updatedStep.metadata.config = {
      responseCode: selectedResponseCode,
      headers: selectedResponseHeaders,
    }

    // Apply updates to the steps map
    upsertStep(currentStep.id, updatedStep)

    // eslint-disable-next-line -- currentStep in the dependencies array causes step configs to sometimes be copied
  }, [selectedResponseCode, selectedResponseHeaders, upsertStep])

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
