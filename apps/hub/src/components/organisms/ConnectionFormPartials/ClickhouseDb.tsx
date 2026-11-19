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
import { Dispatch, FC, useEffect, useMemo, useState } from 'react'
import { Connection } from '@prisma/client'

type Props = {
  setFormData: Dispatch<Map<string, string | number | string[] | number[]>>
  secretOptions: { label: string; value: string }[]
  initial?: Partial<Connection>
}

const ClickhouseDatabase: FC<Props> = ({ setFormData, secretOptions, initial }) => {
  const attributes = useMemo(() => {
    if (initial && initial.attributes && typeof initial.attributes === 'string')
      return JSON.parse(initial.attributes)

    if (initial && initial.attributes && typeof initial.attributes === 'object')
      return initial.attributes

    return undefined
  }, [initial])

  const [host, setHost] = useState<string>(attributes?.host)
  const [port, setPort] = useState<number>(attributes?.port ?? 9000)
  const [username, setUsername] = useState<string>(attributes?.username ?? '')
  const [password, setPassword] = useState<string>(() => {
    if (secretOptions.length === 1 && !attributes?.password) {
      return secretOptions[0].value
    }
    return attributes?.password ?? ''
  })
  const [database, setDatabase] = useState<string>(attributes?.database ?? '')

  useEffect(() => {
    const updatedFormData = new Map()
    updatedFormData.set('host', host)
    updatedFormData.set('port', port)
    updatedFormData.set('username', username)
    updatedFormData.set('password', password)
    updatedFormData.set('database', database)
    setFormData(updatedFormData)
  }, [host, port, username, password, database, setFormData])

  return (
    <>
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
        <FieldLabel htmlFor="username">Username</FieldLabel>
        <Input
          id="username"
          name="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
      </Field>
      <Field className="mt-4 mb-2">
        <FieldLabel htmlFor="password">Database Password</FieldLabel>
        <Select
          name="password"
          value={password ?? ''}
          onValueChange={(value) => setPassword(value)}
        >
          <SelectTrigger id="password" className="w-full">
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
        <FieldLabel htmlFor="database">Database Name</FieldLabel>
        <Input
          id="database"
          name="database"
          value={database}
          onChange={(e) => setDatabase(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
      </Field>
    </>
  )
}

export default ClickhouseDatabase
