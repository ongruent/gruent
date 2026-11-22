import type { ChannelNodeType } from './types'

/** Category colors shared by the canvas, the step library and the inspector, so a step looks the same everywhere. */
export type StepCategoryStyle = {
  label: string
  /** Icon chip: tinted background and foreground */
  chip: string
  /** Selection ring around a step on the canvas */
  ring: string
  /** Thin accent bar on the leading edge of a step */
  accent: string
}

export const stepCategoryStyles: Record<ChannelNodeType | 'default', StepCategoryStyle> = {
  source: {
    label: 'Source',
    chip: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
    ring: 'ring-green-500',
    accent: 'bg-green-500',
  },
  processing: {
    label: 'Processing',
    chip: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
    ring: 'ring-blue-500',
    accent: 'bg-blue-500',
  },
  conditional: {
    label: 'Conditional',
    chip: 'bg-orange-100 text-orange-800 dark:bg-orange-950/60 dark:text-orange-300',
    ring: 'ring-orange-500',
    accent: 'bg-orange-500',
  },
  action: {
    label: 'Action',
    chip: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
    ring: 'ring-red-500',
    accent: 'bg-red-500',
  },
  custom: {
    label: 'Custom',
    chip: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
    ring: 'ring-violet-500',
    accent: 'bg-violet-500',
  },
  default: {
    label: 'Step',
    chip: 'bg-muted text-muted-foreground',
    ring: 'ring-gray-500',
    accent: 'bg-gray-400',
  },
}

export const stepCategoryStyle = (type: ChannelNodeType | string | undefined) =>
  stepCategoryStyles[type as ChannelNodeType] ?? stepCategoryStyles.default
