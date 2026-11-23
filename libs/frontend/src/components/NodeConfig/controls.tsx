'use client'

import {
  type FieldModel,
  type ItemSchema,
  isDateTime,
  type Option,
  withKeyedRow,
} from '@gruent/libs/engine/steps/ts'
import { Button } from '@gruent/libs/frontend/components/core/button'
import { Checkbox } from '@gruent/libs/frontend/components/core/checkbox'
import { Input } from '@gruent/libs/frontend/components/core/input'
import { Textarea } from '@gruent/libs/frontend/components/core/textarea'
import { PlusIcon, Trash2Icon } from 'lucide-react'
import { FC, type ReactNode, useEffect, useState } from 'react'

type ControlProps = {
  id: string
  field: FieldModel
  value: unknown
  invalid: boolean
  /** `undefined` removes the key from the configuration. */
  onChange: (value: unknown) => void
}

/** Saved values are displayed as-is, even when they have the wrong type, so nothing is hidden or rewritten. */
const display = (value: unknown) =>
  value === undefined ? '' : typeof value === 'string' ? value : JSON.stringify(value)

export const TextControl: FC<ControlProps & { multiline?: boolean }> = ({
  id,
  field,
  value,
  invalid,
  onChange,
  multiline,
}) => {
  const props = {
    id,
    value: display(value),
    placeholder: field.schema['x-ui'].placeholder,
    'aria-invalid': invalid,
    'aria-required': field.required,
    // Clearing the input removes the key; required fields then report "is required".
    onChange: (e: { target: { value: string } }) =>
      onChange(e.target.value === '' ? undefined : e.target.value),
  }
  return multiline ? <Textarea {...props} /> : <Input type="text" {...props} />
}

type NumberInputProps = {
  id: string
  value: unknown
  invalid: boolean
  required: boolean
  schema: Pick<ItemSchema, 'minimum' | 'maximum'>
  step?: number
  placeholder?: string
  label?: string
  onChange: (value: number | undefined) => void
}

/**
 * Keeps the typed text locally so intermediate input such as "0." is not lost, and only reports parseable
 * numbers. Numbers are never coerced from other types.
 */
export const NumberInput: FC<NumberInputProps> = ({
  id,
  value,
  invalid,
  required,
  schema,
  step,
  placeholder,
  label,
  onChange,
}) => {
  const [draft, setDraft] = useState(display(value))
  useEffect(() => {
    setDraft((current) => (current !== '' && Number(current) === value ? current : display(value)))
  }, [value])

  return (
    <Input
      id={id}
      type="number"
      inputMode="decimal"
      value={draft}
      step={step ?? 'any'}
      min={schema.minimum}
      max={schema.maximum}
      placeholder={placeholder}
      aria-label={label}
      aria-invalid={invalid}
      aria-required={required}
      onChange={(e) => {
        const text = e.target.value
        setDraft(text)
        if (text.trim() === '') onChange(undefined)
        else if (Number.isFinite(Number(text))) onChange(Number(text))
      }}
    />
  )
}

export const NumberControl: FC<ControlProps> = ({ id, field, value, invalid, onChange }) => (
  <>
    <NumberInput
      id={id}
      value={value}
      invalid={invalid}
      required={field.required}
      schema={field.schema}
      step={field.schema['x-ui'].step}
      placeholder={field.schema['x-ui'].placeholder}
      onChange={onChange}
    />
    {/* A number input cannot display other types, so show the saved value instead of hiding it. */}
    {value !== undefined && typeof value !== 'number' && (
      <p className="text-sm text-muted-foreground">Saved value: {JSON.stringify(value)}</p>
    )}
  </>
)

export const ToggleControl: FC<ControlProps> = ({ id, field, value, invalid, onChange }) => (
  <Checkbox
    id={id}
    checked={value === true}
    aria-invalid={invalid}
    aria-required={field.required}
    onCheckedChange={(checked) => onChange(checked === true)}
  />
)

const pad = (n: number) => String(n).padStart(2, '0')

/** RFC 3339 value -> local "YYYY-MM-DDTHH:mm:ss" for <input type="datetime-local">. */
const toLocalInput = (value: string) => {
  const d = new Date(value)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/** Local datetime-local value -> RFC 3339 UTC timestamp matching the contract's date-time profile. */
const fromLocalInput = (local: string) => new Date(local).toISOString().replace(/\.000Z$/, 'Z')

export const DateTimeControl: FC<ControlProps> = ({ id, field, value, invalid, onChange }) => {
  // A saved value outside the contract's date-time profile is shown verbatim so it can be corrected, rather
  // than being dropped by the browser's date picker.
  if (value !== undefined && (typeof value !== 'string' || !isDateTime(value)))
    return <TextControl id={id} field={field} value={value} invalid={invalid} onChange={onChange} />

  return (
    <Input
      id={id}
      type="datetime-local"
      step={1}
      value={typeof value === 'string' ? toLocalInput(value) : ''}
      aria-invalid={invalid}
      aria-required={field.required}
      onChange={(e) => {
        const local = e.target.value
        if (!local) return onChange(undefined)
        if (!Number.isNaN(new Date(local).getTime())) onChange(fromLocalInput(local))
      }}
    />
  )
}

/** Repeated primitive values. Item errors are reported at `<field>/<index>`. */
export const ListControl: FC<ControlProps & { itemInvalid: (index: number) => boolean }> = ({
  id,
  field,
  value,
  invalid,
  itemInvalid,
  onChange,
}) => {
  const items = Array.isArray(value) ? (value as unknown[]) : []
  const itemSchema = field.schema.items
  const numeric = itemSchema?.type === 'number' || itemSchema?.type === 'integer'
  const max = field.schema.maxItems

  const setItem = (index: number, item: unknown) =>
    onChange(items.map((v, i) => (i === index ? item : v)))
  const removeItem = (index: number) => {
    const next = items.filter((_, i) => i !== index)
    onChange(next.length > 0 ? next : undefined)
  }

  return (
    <div className="flex flex-col gap-2" id={id} aria-invalid={invalid}>
      {value !== undefined && !Array.isArray(value) && (
        <p className="text-sm text-destructive">Saved value is not a list: {display(value)}</p>
      )}
      {items.map((item, index) => {
        const itemId = `${id}-${index}`
        const label = `${field.schema.title} item ${index + 1}`
        return (
          <div key={index} className="flex items-center gap-2">
            {numeric ? (
              <NumberInput
                id={itemId}
                label={label}
                value={item}
                invalid={itemInvalid(index)}
                required
                schema={itemSchema ?? {}}
                step={field.schema['x-ui'].step}
                onChange={(n) => n !== undefined && setItem(index, n)}
              />
            ) : (
              <Input
                id={itemId}
                aria-label={label}
                value={display(item)}
                aria-invalid={itemInvalid(index)}
                onChange={(e) => setItem(index, e.target.value)}
              />
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Remove ${label}`}
              onClick={() => removeItem(index)}
            >
              <Trash2Icon />
            </Button>
          </div>
        )
      })}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start"
        disabled={max !== undefined && items.length >= max}
        onClick={() => onChange([...items, numeric ? 0 : ''])}
      >
        <PlusIcon /> Add item
      </Button>
    </div>
  )
}

/**
 * Repeatable rows of an objectList field. The parent renders each row's fields with the regular controls;
 * new rows start from the item fields' declared defaults. Saved values that are not lists are shown, not
 * rewritten.
 */
export const ObjectListControl: FC<
  Omit<ControlProps, 'field'> & {
    title: string
    maxItems?: number
    newItem: () => Record<string, unknown>
    renderRow: (
      index: number,
      item: Record<string, unknown>,
      onChange: (item: Record<string, unknown>) => void,
    ) => ReactNode
  }
> = ({ id, title, maxItems, value, invalid, newItem, renderRow, onChange }) => {
  const rows = Array.isArray(value) ? (value as unknown[]) : []
  const setRow = (index: number, row: Record<string, unknown>) =>
    onChange(rows.map((v, i) => (i === index ? row : v)))
  const removeRow = (index: number) => {
    const next = rows.filter((_, i) => i !== index)
    onChange(next.length > 0 ? next : undefined)
  }

  return (
    <div className="flex flex-col gap-3" id={id} aria-invalid={invalid}>
      {value !== undefined && !Array.isArray(value) && (
        <p className="text-sm text-destructive">Saved value is not a list: {display(value)}</p>
      )}
      {rows.map((row, index) => {
        const label = `${title} ${index + 1}`
        const item =
          row && typeof row === 'object' && !Array.isArray(row)
            ? (row as Record<string, unknown>)
            : undefined
        return (
          <section
            key={index}
            aria-label={label}
            data-row={index}
            className="flex flex-col gap-3 rounded-md border p-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">{label}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remove ${label}`}
                onClick={() => removeRow(index)}
              >
                <Trash2Icon />
              </Button>
            </div>
            {item ? (
              renderRow(index, item, (next) => setRow(index, next))
            ) : (
              <p className="text-sm text-destructive">Saved row is not an object: {display(row)}</p>
            )}
          </section>
        )
      })}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start"
        disabled={maxItems !== undefined && rows.length >= maxItems}
        onClick={() => onChange([...rows, newItem()])}
      >
        <PlusIcon /> Add {rows.length > 0 ? 'another' : 'one'}
      </Button>
    </div>
  )
}

/**
 * An objectList with x-ui.keyField: one row per option of the key field (e.g. per output model field),
 * labelled by the option. Rows are saved only once one of their other fields is set. Saved rows whose key is
 * no longer offered stay visible as unavailable, so they can be removed but are never dropped silently.
 */
export const KeyedObjectListControl: FC<{
  id: string
  value: unknown
  invalid: boolean
  keyField: string
  options: Option[]
  loading: boolean
  error?: string
  /** Shown when there are no options and nothing is loading, e.g. before a model is selected. */
  emptyMessage: string
  onChange: (value: unknown) => void
  /** Renders a row's fields. index is the row's position in the saved list, or past its end for new rows. */
  renderRow: (
    index: number,
    row: Record<string, unknown>,
    onChange: (row: Record<string, unknown>) => void,
  ) => ReactNode
}> = ({ id, value, invalid, keyField, options, loading, error, emptyMessage, onChange, renderRow }) => {
  const rows = (Array.isArray(value) ? value : []).filter(
    (r): r is Record<string, unknown> => !!r && typeof r === 'object' && !Array.isArray(r),
  )
  const keyOf = (row: Record<string, unknown>) => (typeof row[keyField] === 'string' ? (row[keyField] as string) : '')
  const offered = new Set(options.map((o) => o.value))
  const unavailable = loading ? [] : rows.filter((r) => !offered.has(keyOf(r)))
  let next = rows.length

  const section = (key: string, label: string, row: Record<string, unknown>, removable: boolean) => {
    const saved = rows.findIndex((r) => keyOf(r) === key)
    const index = saved >= 0 ? saved : next++
    return (
      <section
        key={key}
        aria-label={label}
        data-row={index}
        data-key={key}
        className="flex flex-col gap-3 rounded-md border p-3"
      >
        <div className="flex items-center justify-between">
          <span className={`text-xs font-medium ${removable ? 'text-destructive' : 'text-muted-foreground'}`}>
            {label}
          </span>
          {removable && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Remove ${label}`}
              onClick={() => onChange(withKeyedRow(rows, keyField, key, { [keyField]: key }))}
            >
              <Trash2Icon />
            </Button>
          )}
        </div>
        {renderRow(index, row, (changed) => onChange(withKeyedRow(rows, keyField, key, changed)))}
      </section>
    )
  }

  return (
    <div className="flex flex-col gap-3" id={id} aria-invalid={invalid}>
      {value !== undefined && !Array.isArray(value) && (
        <p className="text-sm text-destructive">Saved value is not a list: {display(value)}</p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {loading && options.length === 0 && <p className="text-sm text-muted-foreground">Loading…</p>}
      {!loading && !error && options.length === 0 && (
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      )}
      {options.map((o) => section(o.value, o.label, rows.find((r) => keyOf(r) === o.value) ?? {}, false))}
      {unavailable.map((r) => section(keyOf(r), `${keyOf(r) || '(no key)'} (unavailable)`, r, true))}
    </div>
  )
}
