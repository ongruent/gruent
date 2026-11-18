'use client'

import { Field, FieldLabel } from '@gruent/libs/frontend/components/core/field'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@gruent/libs/frontend/components/core/select'
import { Thing } from '@prisma/client'
import { Dispatch, FC, useEffect, useMemo, useState } from 'react'

type Props = {
  setFormData: Dispatch<Map<string, string | number | string[] | number[]>>
  secretOptions: { label: string; value: string }[]
  initial?: Partial<Thing>
}

const SendgridClient: FC<Props> = ({ setFormData, secretOptions, initial }) => {
  const attributes = useMemo(() => {
    if (initial && initial.attributes && typeof initial.attributes === 'string')
      return JSON.parse(initial.attributes)

    if (initial && initial.attributes && typeof initial.attributes === 'object')
      return initial.attributes

    return undefined
  }, [initial])

  const [sendgridApiKey, setSendgridApiKey] = useState<string>(() => {
    if (secretOptions.length === 1 && !attributes?.apiKey) {
      return secretOptions[0].value
    }
    return attributes?.apiKey ?? ''
  })

  useEffect(() => {
    const updatedFormData = new Map()
    updatedFormData.set('apiKey', sendgridApiKey)
    setFormData(updatedFormData)
  }, [sendgridApiKey, setFormData])

  return (
    <>
      <Field className="mt-4 mb-2">
        <FieldLabel htmlFor="apiKey">Sendgrid API Key</FieldLabel>
        <Select
          name="apiKey"
          value={sendgridApiKey ?? ''}
          onValueChange={(value) => setSendgridApiKey(value)}
        >
          <SelectTrigger id="apiKey" className="w-full">
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
    </>
  )
}

export default SendgridClient
