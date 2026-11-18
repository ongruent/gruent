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

const S3Bucket: FC<Props> = ({ setFormData, secretOptions, initial }) => {
  const attributes = useMemo(() => {
    if (initial && initial.attributes && typeof initial.attributes === 'string')
      return JSON.parse(initial.attributes)

    if (initial && initial.attributes && typeof initial.attributes === 'object')
      return initial.attributes

    return undefined
  }, [initial])

  const [AwsAccessKeyId, setAwsAccessKeyId] = useState<string>(attributes?.AwsAccessKeyId ?? '')
  const [AwsSecretAccessKey, setAwsSecretAccessKey] = useState<string>(() => {
    if (secretOptions.length === 1 && !attributes?.AwsSecretAccessKey) {
      return secretOptions[0].value
    }
    return attributes?.AwsSecretAccessKey ?? ''
  })
  const [AwsRegion, setAwsRegion] = useState<string>(attributes?.AwsRegion ?? '')
  const [bucketName, setbucketName] = useState<string>(attributes?.bucketName ?? '')

  useEffect(() => {
    const updatedFormData = new Map()
    updatedFormData.set('AwsAccessKeyId', AwsAccessKeyId)
    updatedFormData.set('AwsSecretAccessKey', AwsSecretAccessKey)
    updatedFormData.set('AwsRegion', AwsRegion)
    updatedFormData.set('bucketName', bucketName)
    setFormData(updatedFormData)
  }, [AwsAccessKeyId, AwsSecretAccessKey, AwsRegion, bucketName, setFormData])

  return (
    <>
      <Field className="mt-4 mb-2">
        <FieldLabel htmlFor="AwsAccessKeyId">AWS Access Key ID</FieldLabel>
        <Input
          id="AwsAccessKeyId"
          name="AwsAccessKeyId"
          value={AwsAccessKeyId}
          onChange={(e) => setAwsAccessKeyId(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
      </Field>
      <Field className="mt-4 mb-2">
        <FieldLabel htmlFor="AwsSecretAccessKey">AWS Secret Access Key</FieldLabel>
        <Select
          name="AwsSecretAccessKey"
          value={AwsSecretAccessKey ?? ''}
          onValueChange={(value) => setAwsSecretAccessKey(value)}
        >
          <SelectTrigger id="AwsSecretAccessKey" className="w-full">
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
        <FieldLabel htmlFor="AwsRegion">AWS Region</FieldLabel>
        <Input
          id="AwsRegion"
          name="AwsRegion"
          value={AwsRegion}
          onChange={(e) => setAwsRegion(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
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
    </>
  )
}

export default S3Bucket
