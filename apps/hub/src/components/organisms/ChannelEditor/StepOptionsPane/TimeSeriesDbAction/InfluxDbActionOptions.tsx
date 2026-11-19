import useChannelEditorStore from '@gruent/hub/stores/channelEditorStore'
import { ChannelNode } from '@gruent/libs/legacy/engine/nodes/v1'
import { TimeSeriesDbNodeConfig } from '@gruent/libs/engine/nodes/v1/src/action/timeSeriesDb'
import { Connection } from '@prisma/client'
import { FC, useEffect, useMemo, useState } from 'react'
import { openModal } from '@gruent/libs/frontend/hooks/useModal'
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
  connections: Connection[]
  orgId: string
  spaceId: string
  timeSeriesDatabaseOptions: {
    label: string
    value: string
  }[]
  selectedTimeSeriesDatabase?: Connection
}

const InfluxDbActionOptions: FC<Props> = ({
  connections,
  orgId,
  spaceId,
  timeSeriesDatabaseOptions: timeSeriesDatabaseOptions,
  selectedTimeSeriesDatabase: selectedTimeSeriesDatabase,
}) => {
  const upsertStep = useChannelEditorStore((state) => state.upsertStep)
  const currentStep = useChannelEditorStore(
    (state) => state.currentStep as ChannelNode<TimeSeriesDbNodeConfig>,
  )

  const [bucket, setBucket] = useState<string>('')

  // load in default values
  useEffect(() => {
    const currentConfig = { ...currentStep.metadata.config }
    if (!connections) return

    setBucket(currentConfig?.bucket || '')
  }, [currentStep, connections])

  // update config and dependencies when options have been updated
  useEffect(() => {
    if (!selectedTimeSeriesDatabase) return

    // update config
    const updatedStep = structuredClone(currentStep)

    updatedStep.metadata.config = {
      'influxdbDatabase::thing': selectedTimeSeriesDatabase.id,
      bucket: bucket,
    }

    // update connections dependency array
    updatedStep.metadata.dependencies.things = [
      {
        fieldName: 'influxdbDatabase::thing',
        internal: false,
        thingId: selectedTimeSeriesDatabase.id,
      },
    ]

    // apply updates to the steps map
    upsertStep(currentStep.id, updatedStep)

    // eslint-disable-next-line -- currentStep in the dependencies array causes step configs to sometimes be copied
  }, [bucket, selectedTimeSeriesDatabase, upsertStep])

  // Memoize database options
  const bucketOptions = useMemo((): { label: string; value: string }[] => {
    if (!selectedTimeSeriesDatabase || !selectedTimeSeriesDatabase.attributes) return []

    try {
      const attributes = JSON.parse(selectedTimeSeriesDatabase.attributes as string)

      if (attributes.buckets && attributes.buckets.length && attributes.buckets.length > 0) {
        return attributes.buckets.map((bucket) => ({
          label: bucket,
          value: bucket,
        }))
      }
    } catch (e) {
      console.error('Could not create options for the buckets select field', e)
    }

    return []
  }, [selectedTimeSeriesDatabase])

  if (!timeSeriesDatabaseOptions || timeSeriesDatabaseOptions.length <= 0)
    return (
      <p>
        <Button variant="link" onClick={() => openModal('createConnection')}>
          Add a time series database
        </Button>{' '}
        to your space before using this step.
      </p>
    )

  return (
    <>
      {bucketOptions.length <= 0 && (
        <p className="mb-2">
          <a
            href={`/organizations/${orgId}/spaces/${spaceId}/connections/${selectedTimeSeriesDatabase!.id}`}
            className="text-blue-500 underline"
          >
            Add at least one bucket
          </a>{' '}
          to this InfluxDB server before using it.
        </p>
      )}
      {bucketOptions.length > 0 && (
        <Field className="my-3">
          <FieldLabel htmlFor="bucket">Bucket</FieldLabel>
          <Select name="bucket" value={bucket} onValueChange={(value) => setBucket(value)}>
            <SelectTrigger id="bucket" className="w-full">
              <SelectValue placeholder="Select an option" />
            </SelectTrigger>
            <SelectContent>
              {bucketOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}
    </>
  )
}

export default InfluxDbActionOptions
