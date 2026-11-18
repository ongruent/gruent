import useChannelEditorStore from '@gruent/hub/stores/channelEditorStore'
import { ChannelNode } from '@gruent/libs/legacy/engine/nodes/v1'
import { TimeSeriesDbNodeConfig } from '@gruent/libs/engine/nodes/v1/src/action/timeSeriesDb'
import { Thing } from '@prisma/client'
import { FC, useEffect, useMemo, useState } from 'react'
import InfluxDbActionOptions from './InfluxDbActionOptions'
import { openModal } from '@gruent/libs/frontend/hooks/useModal'
import { PlusIcon } from 'lucide-react'
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
  things: Thing[]
  orgId: string
  spaceId: string
}

export enum TimeSeriesDb {
  InfluxDB = 'InfluxDB',
}

const TimeSeriesDbActionOptions: FC<Props> = ({ things, orgId, spaceId }) => {
  const currentNode = useChannelEditorStore(
    (state) => state.currentNode as ChannelNode<TimeSeriesDbNodeConfig>,
  )

  const [selectedTimeSeriesDatabase, setSelectedTimeSeriesDatabase] = useState<Thing>()

  // load in the default message queue client from the current node config
  useEffect(() => {
    const currentConfig = { ...currentNode.metadata.config }
    if (!things) return

    if (Object.keys(currentConfig).includes('influxdbDatabase::thing')) {
      const influxdbDatabase = things.find((s) => {
        if (s.id === currentConfig['influxdbDatabase::thing']) return true
        return false
      })
      if (influxdbDatabase) setSelectedTimeSeriesDatabase(influxdbDatabase)
      return
    }
  }, [currentNode, things])

  const selectedTimeSeriesDatabaseType = useMemo(() => {
    if (!selectedTimeSeriesDatabase) return

    if (selectedTimeSeriesDatabase.thingCategory === 'INFLUXDB_DATABASE')
      return TimeSeriesDb.InfluxDB

    return
  }, [selectedTimeSeriesDatabase])

  const timeSeriesDatabases = useMemo(() => {
    if (!things) return []

    const influxDb = things.filter((thing) => {
      if (thing.thingCategory == 'INFLUXDB_DATABASE') return true
      return false
    })

    return [...influxDb]
  }, [things])

  const timeSeriesDatabaseOptions = useMemo(() => {
    return timeSeriesDatabases.map((thing) => ({
      label: thing.name,
      value: thing.id,
    }))
  }, [timeSeriesDatabases])

  const selectedSubnodeOptions = useMemo(() => {
    if (!selectedTimeSeriesDatabaseType) return

    switch (selectedTimeSeriesDatabaseType) {
      case TimeSeriesDb.InfluxDB:
        return (
          <InfluxDbActionOptions
            things={things}
            orgId={orgId}
            spaceId={spaceId}
            timeSeriesDatabaseOptions={timeSeriesDatabaseOptions}
            selectedTimeSeriesDatabase={selectedTimeSeriesDatabase}
          />
        )
    }
  }, [
    selectedTimeSeriesDatabaseType,
    timeSeriesDatabaseOptions,
    selectedTimeSeriesDatabase,
    orgId,
    spaceId,
    things,
  ])

  if (!timeSeriesDatabases || timeSeriesDatabases.length <= 0)
    return (
      <p className="mb-2">
        <Button variant="link" onClick={() => openModal('createThing')}>
          Add a time series database
        </Button>{' '}
        to your space before using this node.
      </p>
    )

  return (
    <>
      <div className="flex flex-row items-end gap-2">
        <Field className="my-3 grow">
          <FieldLabel htmlFor="timeSeriesDatabase">Time Series Database</FieldLabel>
          <Select
            name="timeSeriesDatabase"
            value={selectedTimeSeriesDatabase?.id ?? ''}
            onValueChange={(value) =>
              setSelectedTimeSeriesDatabase(
                timeSeriesDatabases.find((s) => {
                  if (s.id === value) return true
                  return false
                }),
              )
            }
          >
            <SelectTrigger id="timeSeriesDatabase" className="w-full">
              <SelectValue placeholder="Select an option" />
            </SelectTrigger>
            <SelectContent>
              {timeSeriesDatabaseOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Button
          size="icon"
          aria-label="Create thing"
          className="my-3"
          onClick={() => openModal('createThing')}
        >
          <PlusIcon />
        </Button>
      </div>
      {selectedSubnodeOptions}
    </>
  )
}

export default TimeSeriesDbActionOptions
