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
import { XIcon } from 'lucide-react'
import { Connection } from '@prisma/client'
import { Dispatch, FC, useEffect, useMemo, useState } from 'react'

type Props = {
  setFormData: Dispatch<Map<string, string | number | string[] | number[]>>
  secretOptions: { label: string; value: string }[]
  initial?: Partial<Connection>
}

const MongoDbServer: FC<Props> = ({ setFormData, secretOptions, initial }) => {
  const attributes = useMemo(() => {
    if (initial && initial.attributes && typeof initial.attributes === 'string')
      return JSON.parse(initial.attributes)

    if (initial && initial.attributes && typeof initial.attributes === 'object')
      return initial.attributes

    return undefined
  }, [initial])

  const [protocol, setProtocol] = useState<'mongodb' | 'mongodb+srv'>(
    attributes?.protocol ?? 'mongodb',
  )
  const [host, setHost] = useState<string>(attributes?.host ?? '')
  const [port, setPort] = useState<number>(attributes?.port ?? 27017)
  const [username, setUsername] = useState<string>(attributes?.username ?? '')
  const [password, setPassword] = useState<string>(attributes?.password ?? '')
  const [databases, setDatabases] = useState<string[]>(attributes?.databases ?? [])
  const [collections, setCollections] = useState<Record<string, string[] | undefined>>(
    attributes?.collections ?? {},
  )

  useEffect(() => {
    const updatedFormData = new Map()
    updatedFormData.set('protocol', protocol)
    updatedFormData.set('host', host)
    if (protocol === 'mongodb') updatedFormData.set('port', port)
    updatedFormData.set('username', username)
    updatedFormData.set('password', password)
    updatedFormData.set('databases', databases)
    updatedFormData.set('collections', collections)
    setFormData(updatedFormData)
  }, [protocol, host, port, username, password, databases, collections, setFormData])

  return (
    <>
      <Field className="mt-4 mb-2">
        <FieldLabel htmlFor="protocol">Protocol</FieldLabel>
        <Select
          name="protocol"
          value={protocol ?? ''}
          onValueChange={(value) => setProtocol(value as 'mongodb' | 'mongodb+srv')}
        >
          <SelectTrigger id="protocol" className="w-full">
            <SelectValue placeholder="Select an option" />
          </SelectTrigger>
          <SelectContent>
            {[
              {
                label: 'mongodb',
                value: 'mongodb',
              },
              {
                label: 'mongodb+srv',
                value: 'mongodb+srv',
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
      {protocol === 'mongodb' && (
        <Field className="mt-4 mb-2">
          <FieldLabel htmlFor="port">Port</FieldLabel>
          <Input
            id="port"
            name="port"
            type="number"
            min="1"
            max="65535"
            value={port.toString()}
            onChange={(e) => setPort(parseInt(e.target.value))}
            autoComplete="off"
            spellCheck={false}
          />
        </Field>
      )}
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
        <FieldLabel htmlFor="password">Password</FieldLabel>
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
      {databases.map((database, i) => {
        return (
          <div key={`database-${i}`}>
            <div className="flex mt-4 items-center">
              <Field className="my-3 grow">
                <FieldLabel htmlFor={`database-${i}`}>{`Database ${i + 1}`}</FieldLabel>
                <Input
                  id={`database-${i}`}
                  name={`database-${i}`}
                  value={database}
                  onChange={(e) =>
                    setDatabases((current) => {
                      const updated = [...current]
                      updated[i] = e.target.value
                      return updated
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
                  setDatabases((current) => current.filter((_p, j) => i !== j))
                  setCollections((current) => {
                    const updated = structuredClone(current)
                    updated[database] = undefined
                    return updated
                  })
                }}
              />
            </div>
            {collections[database] &&
              collections[database].map((collection, j) => {
                return (
                  <div key={`collection-${j}`} className="flex mt-0 mb-0 ml-4 items-center">
                    <Field className="my-3 grow">
                      <FieldLabel htmlFor={`collection-${j}`}>{`Collection ${j + 1}`}</FieldLabel>
                      <Input
                        id={`collection-${j}`}
                        name={`collection-${j}`}
                        value={collection}
                        onChange={(e) =>
                          setCollections((current) => {
                            const updated = structuredClone(current)
                            if (updated[database]) updated[database][j] = e.target.value
                            return updated
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
                        setCollections((current) => {
                          const updated = structuredClone(current)
                          updated[database] = updated[database]?.filter((_p, k) => j !== k) || []
                          return updated
                        })
                      }}
                    />
                  </div>
                )
              })}
            <Button
              className="mb-1 ml-4"
              onClick={() =>
                setCollections((current) => {
                  const updated = structuredClone(current)
                  if (!updated[database]) {
                    updated[database] = ['']
                  } else {
                    updated[database] = [...updated[database], '']
                  }

                  return updated
                })
              }
            >
              Add Collection
            </Button>
          </div>
        )
      })}
      <div className="flex">
        <Button
          className="mt-2 mb-4"
          onClick={() => setDatabases((current) => [...current, `database${databases.length + 1}`])}
        >
          Add Database
        </Button>
      </div>
    </>
  )
}

export default MongoDbServer
