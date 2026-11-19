'use client'

import { Field, FieldLabel } from '@gruent/libs/frontend/components/core/field'
import { Input } from '@gruent/libs/frontend/components/core/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@gruent/libs/frontend/components/core/select'
import { Connection } from '@prisma/client'
import { Dispatch, FC, useEffect, useMemo, useState } from 'react'

type Props = {
  setFormData: Dispatch<Map<string, string | number | string[] | number[]>>
  initial?: Partial<Connection>
}

const MqttBroker: FC<Props> = ({ setFormData, initial }) => {
  const attributes = useMemo(() => {
    if (initial && initial.attributes && typeof initial.attributes === 'string')
      return JSON.parse(initial.attributes)

    if (initial && initial.attributes && typeof initial.attributes === 'object')
      return initial.attributes

    return undefined
  }, [initial])

  const [protocol, setProtocol] = useState<'mqtt' | 'mqtts'>(attributes?.protocol ?? 'mqtt')
  const [host, setHost] = useState<string>(attributes?.host)
  const [port, setPort] = useState<number>(attributes?.port ?? 1883)

  useEffect(() => {
    if (protocol === 'mqtt') setPort(1883)
    if (protocol === 'mqtts') setPort(8883)
  }, [protocol])

  useEffect(() => {
    const updatedFormData = new Map()
    updatedFormData.set('protocol', protocol)
    updatedFormData.set('host', host)
    updatedFormData.set('port', port)
    setFormData(updatedFormData)
  }, [protocol, host, port, setFormData])

  return (
    <>
      <Field className="mt-4 mb-2">
        <FieldLabel htmlFor="protocol">Protocol</FieldLabel>
        <Select
          name="protocol"
          value={protocol ?? ''}
          onValueChange={(value) => setProtocol(value as 'mqtt' | 'mqtts')}
        >
          <SelectTrigger id="protocol" className="w-full">
            <SelectValue placeholder="Select an option" />
          </SelectTrigger>
          <SelectContent>
            {[
              {
                label: 'mqtt',
                value: 'mqtt',
              },
              {
                label: 'mqtts',
                value: 'mqtts',
              },
            ].map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field className="mt-4 mb-2">
        <FieldLabel htmlFor="host">Host</FieldLabel>
        <Input
          id="host"
          name="host"
          value={host}
          onChange={(e) => setHost(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
      </Field>
      <Field className="mt-4 mb-2">
        <FieldLabel htmlFor="port">Port</FieldLabel>
        <Input
          id="port"
          name="port"
          value={port.toString()}
          onChange={(e) => setPort(parseInt(e.target.value))}
          autoComplete="off"
          spellCheck={false}
        />
      </Field>
    </>
  )
}

export default MqttBroker
