'use client'

import { Button } from '@gruent/libs/frontend/components/core/button'
import { Field, FieldLabel } from '@gruent/libs/frontend/components/core/field'
import { Input } from '@gruent/libs/frontend/components/core/input'
import { Dispatch, FC, useEffect, useMemo, useState } from 'react'
import { XIcon } from 'lucide-react'
import { Thing } from '@prisma/client'

type Props = {
  setFormData: Dispatch<Map<string, string | number | string[] | number[]>>
  initial?: Partial<Thing>
}

const NatsServer: FC<Props> = ({ setFormData, initial }) => {
  const attributes = useMemo(() => {
    if (initial && initial.attributes && typeof initial.attributes === 'string')
      return JSON.parse(initial.attributes)

    if (initial && initial.attributes && typeof initial.attributes === 'object')
      return initial.attributes

    return undefined
  }, [initial])

  const [host, setHost] = useState<string>(attributes?.host ?? '')
  const [port, setPort] = useState<number>(attributes?.port ?? 4222)
  const [topics, setTopics] = useState<string[]>(attributes?.topics ?? [])

  useEffect(() => {
    const updatedFormData = new Map()
    updatedFormData.set('host', host)
    updatedFormData.set('port', port)
    updatedFormData.set('topics', topics)
    setFormData(updatedFormData)
  }, [host, port, topics, setFormData])

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
          value={port.toString()}
          onChange={(e) => setPort(parseInt(e.target.value))}
          autoComplete="off"
          spellCheck={false}
        />
      </Field>
      {topics.map((topic, i) => {
        return (
          <div key={`topic-${i}`} className="flex mt-4 mb-2 items-center">
            <Field className="my-3 grow">
              <FieldLabel htmlFor={`topic-${i}`}>{`Topic ${i + 1}`}</FieldLabel>
              <Input
                id={`topic-${i}`}
                name={`topic-${i}`}
                value={topic}
                onChange={(e) =>
                  setTopics((current) => {
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
                setTopics((current) => current.filter((_p, j) => i !== j))
              }}
            />
          </div>
        )
      })}
      <div className="flex">
        <Button className="mb-4" onClick={() => setTopics((current) => [...current, ''])}>
          Add Topic
        </Button>
      </div>
    </>
  )
}

export default NatsServer
