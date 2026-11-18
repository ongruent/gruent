'use client'

import { Button } from '@gruent/libs/frontend/components/core/button'
import { Field, FieldLabel } from '@gruent/libs/frontend/components/core/field'
import { Input } from '@gruent/libs/frontend/components/core/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@gruent/libs/frontend/components/core/select'
import { Dispatch, FC, useEffect, useMemo, useState } from 'react'
import { XIcon } from 'lucide-react'
import { Thing } from '@prisma/client'

type Props = {
  setFormData: Dispatch<Map<string, string | number | string[] | number[]>>
  initial?: Partial<Thing>
}

const HttpServer: FC<Props> = ({ setFormData, initial }) => {
  const attributes = useMemo(() => {
    if (initial && initial.attributes && typeof initial.attributes === 'string')
      return JSON.parse(initial.attributes)

    if (initial && initial.attributes && typeof initial.attributes === 'object')
      return initial.attributes

    return undefined
  }, [initial])

  const [protocol, setProtocol] = useState<'http' | 'https'>(attributes?.['protocol'] ?? 'https')
  const [host, setHost] = useState<string>(attributes?.host)
  const [port, setPort] = useState<number>(attributes?.port ?? 443)
  const [paths, setPaths] = useState<string[]>(attributes?.paths ?? [''])

  useEffect(() => {
    if (protocol === 'http') setPort(80)
    if (protocol === 'https') setPort(443)
  }, [protocol])

  useEffect(() => {
    const updatedFormData = new Map()
    updatedFormData.set('protocol', protocol)
    updatedFormData.set('host', host)
    updatedFormData.set('port', port)
    updatedFormData.set('paths', paths)
    setFormData(updatedFormData)
  }, [protocol, host, port, paths, setFormData])

  return (
    <>
      <Field className="mt-4 mb-2">
        <FieldLabel htmlFor="protocol">Protocol</FieldLabel>
        <Select
          name="protocol"
          value={protocol ?? ''}
          onValueChange={(value) => setProtocol(value as 'http' | 'https')}
        >
          <SelectTrigger id="protocol" className="w-full">
            <SelectValue placeholder="Select an option" />
          </SelectTrigger>
          <SelectContent>
            {[
              {
                label: 'http',
                value: 'http',
              },
              {
                label: 'https',
                value: 'https',
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
          type="number"
          value={port.toString()}
          onChange={(e) => setPort(parseInt(e.target.value))}
          autoComplete="off"
          spellCheck={false}
        />
      </Field>
      {paths.map((path, i) => {
        return (
          <div key={`path-${i}`} className="flex mt-4 mb-2 items-center">
            <Field className="my-3 grow">
              <FieldLabel htmlFor={`path-${i}`}>{`Path ${i + 1}`}</FieldLabel>
              <Input
                id={`path-${i}`}
                name={`path-${i}`}
                value={path}
                onChange={(e) =>
                  setPaths((current) => {
                    const n = [...current]
                    n[i] = e.target.value
                    return n
                  })
                }
                autoComplete="off"
                spellCheck={false}
              />
            </Field>
            <XIcon
              size="1em"
              className="-mr-4 text-gray-500 hover:text-red-500 transition cursor-pointer"
              onClick={() => {
                setPaths((current) => current.filter((_p, j) => i !== j))
              }}
            />
          </div>
        )
      })}
      <div className="flex">
        <Button className="mb-4" onClick={() => setPaths((current) => [...current, ''])}>
          Add Path
        </Button>
      </div>
    </>
  )
}

export default HttpServer
