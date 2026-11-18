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
import { Thing } from '@prisma/client'
import { Dispatch, FC, useEffect, useMemo, useState } from 'react'

type Props = {
  setFormData: Dispatch<Map<string, string | number | string[] | number[]>>
  secretOptions: { label: string; value: string }[]
  initial?: Partial<Thing>
}

const MinioBucket: FC<Props> = ({ setFormData, secretOptions, initial }) => {
  const attributes = useMemo(() => {
    if (initial && initial.attributes && typeof initial.attributes === 'string')
      return JSON.parse(initial.attributes)

    if (initial && initial.attributes && typeof initial.attributes === 'object')
      return initial.attributes

    return undefined
  }, [initial])

  const [MinioEndpoint, setMinioEndpoint] = useState<string>(attributes?.MinioEndpoint ?? '')
  const [MinioAccessKeyId, setMinioAccessKeyId] = useState<string>(
    attributes?.MinioAccessKeyId ?? '',
  )
  const [MinioSecretAccessKey, setMinioSecretAccessKey] = useState<string>(() => {
    if (secretOptions.length === 1 && !attributes?.MinioSecretAccessKey) {
      return secretOptions[0].value
    }
    return attributes?.MinioSecretAccessKey ?? ''
  })
  const [bucketName, setbucketName] = useState<string>(attributes?.bucketName ?? '')
  const [UseSSL, setUseSSL] = useState<boolean>(attributes?.UseSSL ?? true)

  useEffect(() => {
    const updatedFormData = new Map()
    updatedFormData.set('MinioEndpoint', MinioEndpoint)
    updatedFormData.set('MinioAccessKeyId', MinioAccessKeyId)
    updatedFormData.set('MinioSecretAccessKey', MinioSecretAccessKey)
    updatedFormData.set('bucketName', bucketName)
    updatedFormData.set('UseSSL', UseSSL)
    setFormData(updatedFormData)
  }, [MinioEndpoint, MinioAccessKeyId, MinioSecretAccessKey, bucketName, UseSSL, setFormData])

  return (
    <>
      <Field className="mt-4 mb-2">
        <FieldLabel htmlFor="MinioEndpoint">Minio Endpoint</FieldLabel>
        <Input
          id="MinioEndpoint"
          name="MinioEndpoint"
          value={MinioEndpoint}
          onChange={(e) => setMinioEndpoint(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
      </Field>
      <Field className="mt-4 mb-2">
        <FieldLabel htmlFor="MinioAccessKeyId">Minio Access Key ID</FieldLabel>
        <Input
          id="MinioAccessKeyId"
          name="MinioAccessKeyId"
          value={MinioAccessKeyId}
          onChange={(e) => setMinioAccessKeyId(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
      </Field>
      <Field className="mt-4 mb-2">
        <FieldLabel htmlFor="MinioSecretAccessKey">Minio Secret Access Key</FieldLabel>
        <Select
          name="MinioSecretAccessKey"
          value={MinioSecretAccessKey ?? ''}
          onValueChange={(value) => setMinioSecretAccessKey(value)}
        >
          <SelectTrigger id="MinioSecretAccessKey" className="w-full">
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
        <FieldLabel htmlFor="bucketName">Bucket Name</FieldLabel>
        <Input
          id="bucketName"
          name="bucketName"
          value={bucketName}
          onChange={(e) => setbucketName(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
      </Field>
      <Field className="mt-4 mb-2">
        <FieldLabel htmlFor="UseSSL">Use SSL</FieldLabel>
        <Select
          name="UseSSL"
          value={UseSSL ? 'true' : 'false'}
          onValueChange={(value) => setUseSSL(value === 'true')}
        >
          <SelectTrigger id="UseSSL" className="w-full">
            <SelectValue placeholder="Select an option" />
          </SelectTrigger>
          <SelectContent>
            {[
              {
                label: 'True',
                value: 'true',
              },
              {
                label: 'False',
                value: 'false',
              },
            ].map((option) => (
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

export default MinioBucket
