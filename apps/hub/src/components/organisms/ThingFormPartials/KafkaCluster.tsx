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

const KafkaCluster: FC<Props> = ({ setFormData, initial }) => {
  const attributes = useMemo(() => {
    if (initial && initial.attributes && typeof initial.attributes === 'string')
      return JSON.parse(initial.attributes)

    if (initial && initial.attributes && typeof initial.attributes === 'object')
      return initial.attributes

    return undefined
  }, [initial])

  const [bootstrapServers, setBootstrapServers] = useState<string[]>(
    attributes?.bootstrapServers ?? [],
  )
  const [topics, setTopics] = useState<string[]>(attributes?.topics ?? [])

  useEffect(() => {
    const updatedFormData = new Map()
    updatedFormData.set('bootstrapServers', bootstrapServers)
    updatedFormData.set('topics', topics)
    setFormData(updatedFormData)
  }, [bootstrapServers, topics, setFormData])

  return (
    <>
      {bootstrapServers.map((bootstrapServer, i) => {
        return (
          <div key={`bootstrapServer-${i}`} className="flex mt-4 mb-2 items-center">
            <Field className="my-3 grow">
              <FieldLabel
                htmlFor={`bootstrapServer-${i}`}
              >{`Bootstrap Server ${i + 1}`}</FieldLabel>
              <Input
                id={`bootstrapServer-${i}`}
                name={`bootstrapServer-${i}`}
                value={bootstrapServer}
                onChange={(e) =>
                  setBootstrapServers((current) => {
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
                setBootstrapServers((current) => current.filter((_p, j) => i !== j))
              }}
            />
          </div>
        )
      })}
      <div className="flex">
        <Button className="mb-4" onClick={() => setBootstrapServers((current) => [...current, ''])}>
          Add Bootstrap Server
        </Button>
      </div>
      {topics.map((topic, i) => {
        return (
          <div key={`topic-${i}`} className="flex mt-4 mb-2 items-center">
            <Field className="my-3 grow">
              <FieldLabel htmlFor={`topic-${i}`}>{`Path ${i + 1}`}</FieldLabel>
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

export default KafkaCluster
