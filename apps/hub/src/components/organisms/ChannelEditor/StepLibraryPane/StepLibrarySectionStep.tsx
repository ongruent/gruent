import type { Definition } from '@gruent/libs/engine/steps/ts'
import { GripVerticalIcon } from 'lucide-react'
import { DragEvent, FC } from 'react'
import { createPluginNode } from '../pluginNodes'
import styles from './StepLibrarySectionStep.module.css'

type Props = {
  definition: Definition
}

/** A draggable step library entry for one exact plugin version. */
const StepLibrarySectionStep: FC<Props> = ({ definition }) => {
  const { displayName, description, pluginType, pluginVersion } = definition.document

  const handleDragStart = (e: DragEvent<HTMLDivElement>) => {
    e.dataTransfer.setData('application/json', JSON.stringify(createPluginNode(definition)))
  }

  return (
    <div className={styles.sectionStep} data-testid={`step-library-${pluginType}-${pluginVersion}`}>
      <div draggable onDragStart={handleDragStart}>
        <GripVerticalIcon
          size="1em"
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-600"
        />
        <h3 className={styles.name}>
          {displayName} <span className="font-normal text-gray-500">v{pluginVersion}</span>
        </h3>
        {description && <p className={styles.description}>{description}</p>}
      </div>
    </div>
  )
}

export default StepLibrarySectionStep
