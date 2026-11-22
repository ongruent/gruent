import type { Definition } from '@gruent/libs/engine/steps/ts'
import { cn } from 'cn'
import { GripVerticalIcon } from 'lucide-react'
import { DragEvent, FC } from 'react'
import { StepCategoryIcon } from '../flow/stepIcons'
import { stepCategoryStyle } from '../flow/stepStyles'
import { createPluginNode } from '../pluginNodes'

type Props = {
  definition: Definition
}

/** A draggable step library entry for one exact plugin version. */
const StepLibrarySectionStep: FC<Props> = ({ definition }) => {
  const { displayName, description, pluginType, pluginVersion, category } = definition.document
  const style = stepCategoryStyle(category)

  const handleDragStart = (e: DragEvent<HTMLDivElement>) => {
    e.dataTransfer.setData('application/json', JSON.stringify(createPluginNode(definition)))
  }

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      title={`Drag ${displayName} onto the canvas`}
      className="group flex cursor-grab items-start gap-3 rounded-md border border-transparent px-2 py-2 select-none transition-colors hover:border-border hover:bg-card hover:shadow-xs active:cursor-grabbing"
      data-testid={`step-library-${pluginType}-${pluginVersion}`}
    >
      <div
        className={cn(
          'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md',
          style.chip,
        )}
      >
        <StepCategoryIcon type={category} className="size-4" />
      </div>
      <div className="min-w-0 grow">
        <h4 className="flex items-baseline gap-1.5 text-sm leading-5 font-medium">
          <span className="truncate">{displayName}</span>
          <span className="shrink-0 text-xs font-normal text-muted-foreground">
            v{pluginVersion}
          </span>
        </h4>
        {description && (
          <p className="line-clamp-2 text-xs leading-4 text-muted-foreground">{description}</p>
        )}
      </div>
      <GripVerticalIcon className="mt-1.5 size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
    </div>
  )
}

export default StepLibrarySectionStep
