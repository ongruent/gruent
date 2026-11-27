'use client'

import { Field, FieldDescription, FieldLabel } from '@gruent/libs/frontend/components/core/field'
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

// Radix selects can't hold an empty value, so "no password" has its own option.
const NO_PASSWORD = '__none__'

export const PostgresSSLModeOptions = [
  { value: 'disable', label: 'Disable' },
  { value: 'allow', label: 'Allow' },
  { value: 'prefer', label: 'Prefer' },
  { value: 'require', label: 'Require' },
  { value: 'verify-ca', label: 'Verify CA' },
  { value: 'verify-full', label: 'Verify full' },
]

const PostgresServer: FC<Props> = ({ setFormData, secretOptions, initial }) => {
  const attributes = useMemo(() => {
    if (initial && initial.attributes && typeof initial.attributes === 'string')
      return JSON.parse(initial.attributes)

    if (initial && initial.attributes && typeof initial.attributes === 'object')
      return initial.attributes

    return undefined
  }, [initial])

  const [host, setHost] = useState<string>(attributes?.host ?? '')
  const [port, setPort] = useState<number>(attributes?.port ?? 5432)
  const [database, setDatabase] = useState<string>(attributes?.database ?? '')
  const [username, setUsername] = useState<string>(attributes?.username ?? '')
  const [password, setPassword] = useState<string>(() => {
    if (secretOptions.length === 1 && !attributes) {
      return secretOptions[0].value
    }
    return attributes?.password ?? ''
  })
  const [sslMode, setSslMode] = useState<string>(attributes?.sslMode ?? 'prefer')

  // Keep the selected secret visible even when it isn't in the list (the secrets haven't loaded yet, or
  // the secret was deleted), so the field never looks like "No password" while a reference is set.
  const passwordOptions = useMemo(() => {
    if (!password || secretOptions.some((option) => option.value === password)) return secretOptions
    return [...secretOptions, { label: `${password} (not found in this space)`, value: password }]
  }, [password, secretOptions])

  useEffect(() => {
    const updatedFormData = new Map()
    updatedFormData.set('host', host)
    updatedFormData.set('port', port)
    updatedFormData.set('database', database)
    updatedFormData.set('username', username)
    // The password is the name of a space secret, never its value.
    updatedFormData.set('password', password)
    updatedFormData.set('sslMode', sslMode)
    setFormData(updatedFormData)
  }, [host, port, database, username, password, sslMode, setFormData])

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
          type="number"
          value={Number.isNaN(port) ? '' : port.toString()}
          onChange={(e) => setPort(parseInt(e.target.value))}
          autoComplete="off"
          spellCheck={false}
        />
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
          value={password || NO_PASSWORD}
          onValueChange={(value) => setPassword(value === NO_PASSWORD ? '' : value)}
        >
          <SelectTrigger id="password" className="w-full">
            <SelectValue placeholder="Select a secret" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_PASSWORD}>No password</SelectItem>
            {passwordOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FieldDescription>
          The space secret that holds the password. Choose &quot;No password&quot; only if the
          server accepts connections without one.
        </FieldDescription>
      </Field>
      <Field className="mt-4 mb-2">
        <FieldLabel htmlFor="sslMode">SSL Mode</FieldLabel>
        <Select name="sslMode" value={sslMode} onValueChange={(value) => setSslMode(value)}>
          <SelectTrigger id="sslMode" className="w-full">
            <SelectValue placeholder="Select an option" />
          </SelectTrigger>
          <SelectContent>
            {PostgresSSLModeOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
    </>
  )
}

export default PostgresServer
