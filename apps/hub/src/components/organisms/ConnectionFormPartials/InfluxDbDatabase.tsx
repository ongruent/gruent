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
import { Connection } from '@prisma/client'

type Props = {
  setFormData: Dispatch<Map<string, string | number | string[] | number[]>>
  secretOptions: { label: string; value: string }[]
  initial?: Partial<Connection>
}

const InfluxDbDatabase: FC<Props> = ({ setFormData, secretOptions, initial }) => {
  const attributes = useMemo(() => {
    if (initial && initial.attributes && typeof initial.attributes === 'string')
      return JSON.parse(initial.attributes)

    if (initial && initial.attributes && typeof initial.attributes === 'object')
      return initial.attributes

    return undefined
  }, [initial])

  const [protocol, setProtocol] = useState<string>(attributes?.protocol ?? 'https')
  const [host, setHost] = useState<string>(attributes?.host)
  const [port, setPort] = useState<number>(attributes?.port ?? 8086)
  const [token, setToken] = useState<string>(() => {
    if (secretOptions.length === 1 && !attributes?.token) {
      return secretOptions[0].value
    }
    return attributes?.token ?? ''
  })
  const [org, setOrg] = useState<string>(attributes?.org)
  const [buckets, setBuckets] = useState<string[]>(attributes?.buckets ?? [''])

  useEffect(() => {
    const updatedFormData = new Map()
    updatedFormData.set('protocol', protocol)
    updatedFormData.set('host', host)
    updatedFormData.set('port', port)
    updatedFormData.set('token', token)
    updatedFormData.set('org', org)
    updatedFormData.set('buckets', buckets)
    setFormData(updatedFormData)
  }, [protocol, host, port, token, org, buckets, setFormData])

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
          value={port.toString()}
          onChange={(e) => setPort(parseInt(e.target.value))}
          autoComplete="off"
          spellCheck={false}
        />
      </Field>
      <Field className="mt-4 mb-2">
        <FieldLabel htmlFor="token">Database Token</FieldLabel>
        <Select name="token" value={token ?? ''} onValueChange={(value) => setToken(value)}>
          <SelectTrigger id="token" className="w-full">
            <SelectValue placeholder="Select an option" />
          </SelectTrigger>
          <SelectContent>
            {secretOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field className="mt-4 mb-2">
        <FieldLabel htmlFor="org">Organization Name</FieldLabel>
        <Input
          id="org"
          name="org"
          value={org}
          onChange={(e) => setOrg(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
      </Field>
      {buckets.map((path, i) => {
        return (
          <div key={`bucket-${i}`} className="flex mt-4 mb-2 items-center">
            <Field className="my-3 grow">
              <FieldLabel htmlFor={`bucket-${i}`}>{`Bucket ${i + 1}`}</FieldLabel>
              <Input
                id={`bucket-${i}`}
                name={`bucket-${i}`}
                value={path}
                onChange={(e) =>
                  setBuckets((current) => {
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
                setBuckets((current) => current.filter((_p, j) => i !== j))
              }}
            />
          </div>
        )
      })}
      <div className="flex">
        <Button className="mb-4" onClick={() => setBuckets((current) => [...current, ''])}>
          Add Bucket
        </Button>
      </div>
    </>
  )
}

export default InfluxDbDatabase
