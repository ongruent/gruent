'use client'

import {
  type Definition,
  describeForm,
  type FieldModel,
  fieldIssues,
  type Issue,
  isFieldVisible,
  type NamedOptions,
  type OptionsEvent,
  type Section,
  withField,
} from '@gruent/libs/engine/steps/ts'
import { Alert, AlertDescription, AlertTitle } from '@gruent/libs/frontend/components/core/alert'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@gruent/libs/frontend/components/core/field'
import { CircleXIcon, LoaderCircleIcon } from 'lucide-react'
import { FC, type ReactElement, useId, useMemo } from 'react'
import { useNodeDefinition } from './context'
import { DateTimeControl, ListControl, NumberControl, TextControl, ToggleControl } from './controls'
import OptionsSelect from './OptionsSelect'

export type { NodeDefinitionSource, NodeDefinitionState } from './context'
export { NodeDefinitionsProvider, useNodeDefinition } from './context'

export type NodeConfigChange = (value: Record<string, unknown>) => void

type FormProps = {
  value: Record<string, unknown>
  /** Parent-owned named option state, keyed by field JSON Pointer. */
  namedOptions: NamedOptions
  onChange: NodeConfigChange
  /** Emitted when a named field appears, its query changes or its declarative parameters change. */
  onOptionsSearch: (request: OptionsEvent) => void
  onOptionsLoadMore: (request: OptionsEvent) => void
}

export type NodeConfigProps = FormProps & {
  pluginType: string
  pluginVersion: number
}

/**
 * Renders a node's configuration from its original definition, resolved by exact plugin identity and version
 * through the nearest NodeDefinitionsProvider. There is no per-plugin code: every field is rendered from the
 * configuration schema and its `x-ui` annotations.
 */
const NodeConfig: FC<NodeConfigProps> = ({ pluginType, pluginVersion, ...props }) => {
  const state = useNodeDefinition(pluginType, pluginVersion)

  if (state.status === 'loading')
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
        <LoaderCircleIcon className="size-4 animate-spin" aria-hidden />
        Loading node definition…
      </p>
    )

  if (state.status === 'error')
    return (
      <Alert variant="destructive" data-testid="node-config-unsupported">
        <CircleXIcon />
        <AlertTitle>
          Unsupported node definition: {pluginType} v{pluginVersion}
        </AlertTitle>
        <AlertDescription>
          <p>{state.error.message}</p>
          <p>The saved configuration is kept unchanged.</p>
        </AlertDescription>
      </Alert>
    )

  return <NodeConfigForm definition={state.definition} {...props} />
}

/** Renders an already resolved definition. Saved values are never rewritten on mount and defaults are never applied. */
export const NodeConfigForm: FC<FormProps & { definition: Definition }> = ({
  definition,
  value,
  namedOptions,
  onChange,
  onOptionsSearch,
  onOptionsLoadMore,
}) => {
  const idPrefix = useId()
  const sections = useMemo(() => describeForm(definition), [definition])
  // Client-side validation uses the original schema. The server remains authoritative.
  const issues = useMemo(() => definition.validateConfig(value), [definition, value])

  // Issues that cannot be shown next to a visible field: hidden fields, unknown keys and root-level problems.
  const shown = sections.flatMap((s) => s.fields.filter((f) => isFieldVisible(s, f, value)))
  const otherIssues = issues.filter((i) => !shown.some((f) => fieldIssues(f, [i]).length > 0))
  const titleFor = (issue: Issue) => {
    const field = sections.flatMap((s) => s.fields).find((f) => fieldIssues(f, [issue]).length > 0)
    return field ? `${field.schema.title} (hidden)` : issue.path || 'Configuration'
  }

  const renderField = (section: Section, field: FieldModel) => {
    if (!isFieldVisible(section, field, value)) return null
    const id = `${idPrefix}${field.path}`
    const errors = fieldIssues(field, issues)
    const invalid = errors.length > 0
    const fieldValue = value[field.name]
    const set = (v: unknown) => onChange(withField(value, field.name, v))
    const { control } = field.schema['x-ui']

    let input: ReactElement
    switch (control) {
      case 'text':
        input = (
          <TextControl id={id} field={field} value={fieldValue} invalid={invalid} onChange={set} />
        )
        break
      case 'textarea':
        input = (
          <TextControl
            id={id}
            field={field}
            value={fieldValue}
            invalid={invalid}
            onChange={set}
            multiline
          />
        )
        break
      case 'number':
        input = (
          <NumberControl
            id={id}
            field={field}
            value={fieldValue}
            invalid={invalid}
            onChange={set}
          />
        )
        break
      case 'toggle':
        input = (
          <ToggleControl
            id={id}
            field={field}
            value={fieldValue}
            invalid={invalid}
            onChange={set}
          />
        )
        break
      case 'datetime':
        input = (
          <DateTimeControl
            id={id}
            field={field}
            value={fieldValue}
            invalid={invalid}
            onChange={set}
          />
        )
        break
      case 'list':
        input = (
          <ListControl
            id={id}
            field={field}
            value={fieldValue}
            invalid={invalid}
            itemInvalid={(i) => errors.some((e) => e.path === `${field.path}/${i}`)}
            onChange={set}
          />
        )
        break
      case 'select':
      case 'multiselect':
        input = (
          <OptionsSelect
            id={id}
            field={field}
            config={value}
            value={fieldValue}
            state={namedOptions[field.path]}
            invalid={invalid}
            onChange={set}
            onOptionsSearch={onOptionsSearch}
            onOptionsLoadMore={onOptionsLoadMore}
          />
        )
        break
      default:
        // Definitions are validated on ingestion, so this only happens if the contract and renderer diverge.
        return (
          <Alert key={field.path} variant="destructive">
            <CircleXIcon />
            <AlertTitle>Unsupported control "{String(control)}"</AlertTitle>
            <AlertDescription>{field.schema.title} cannot be edited.</AlertDescription>
          </Alert>
        )
    }

    const label = (
      <FieldLabel htmlFor={id}>
        {field.schema.title}
        {field.required && (
          <span className="text-destructive" aria-hidden>
            *
          </span>
        )}
      </FieldLabel>
    )

    return (
      <Field key={field.path} data-invalid={invalid} data-path={field.path}>
        {control === 'toggle' ? (
          <div className="flex items-center gap-2">
            {input}
            {label}
          </div>
        ) : (
          <>
            {label}
            {input}
          </>
        )}
        {field.schema.description && (
          <FieldDescription>{field.schema.description}</FieldDescription>
        )}
        <FieldError
          errors={errors.map((e) => ({
            message:
              e.path === field.path
                ? e.message
                : `${e.path.slice(field.path.length + 1)}: ${e.message}`,
          }))}
        />
      </Field>
    )
  }

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(e) => e.preventDefault()}
      noValidate
      data-testid="node-config"
    >
      {sections.map((section) => {
        const fields = section.fields.map((f) => renderField(section, f)).filter(Boolean)
        if (fields.length === 0) return null
        if (!section.group) return <FieldGroup key="_">{fields}</FieldGroup>
        return (
          <FieldSet key={section.group.id} data-group={section.group.id}>
            <FieldLegend>{section.group.title}</FieldLegend>
            {section.group.description && (
              <FieldDescription>{section.group.description}</FieldDescription>
            )}
            <FieldGroup>{fields}</FieldGroup>
          </FieldSet>
        )
      })}
      {otherIssues.length > 0 && (
        <Alert variant="destructive" data-testid="node-config-issues">
          <CircleXIcon />
          <AlertTitle>Configuration issues</AlertTitle>
          <AlertDescription>
            <ul className="list-inside list-disc">
              {otherIssues.map((i) => (
                <li key={`${i.path}:${i.message}`}>
                  {titleFor(i)}: {i.message}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
    </form>
  )
}

export default NodeConfig
