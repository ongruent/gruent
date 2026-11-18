'use client'

import { Field, FieldLabel } from '@gruent/libs/frontend/components/core/field'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@gruent/libs/frontend/components/core/select'

type RuntimeSelectorProps = {
  runtime: 'sm' | 'md' | 'lg'
}

const runtimeOptions = [
  { label: 'Small', value: 'sm' },
  { label: 'Medium', value: 'md' },
  { label: 'Large', value: 'lg' },
]

const runtimeSelector = ({ runtime }: RuntimeSelectorProps) => {
  return (
    <Field className="my-3 max-w-48 mx-auto">
      <FieldLabel htmlFor="runtime">Runtime size</FieldLabel>
      <Select
        name="runtime"
        value={runtime}
        onValueChange={(value) => {
          window.location.search = `?runtime=${value}`
        }}
      >
        <SelectTrigger id="runtime" className="w-full">
          <SelectValue placeholder="Select an option" />
        </SelectTrigger>
        <SelectContent>
          {runtimeOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  )
}

export default runtimeSelector
