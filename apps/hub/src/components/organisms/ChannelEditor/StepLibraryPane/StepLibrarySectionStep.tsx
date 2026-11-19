import { ChannelNode, defaultNodes } from '@gruent/libs/legacy/engine/nodes/v1'
import { DragEvent, FC } from 'react'
import styles from './StepLibrarySectionStep.module.css'
import { GripVerticalIcon } from 'lucide-react'
import { addToast } from '@gruent/libs/frontend/hooks/useToast'

type Props = {
  label: string
  defaultStep: ChannelNode
}

const StepLibrarySectionStep: FC<Props> = ({ label, defaultStep }) => {
  const handleDragStart = (e: DragEvent<HTMLDivElement>, stepName: string) => {
    const defaultStepValue = defaultNodes.get(stepName)
    if (!defaultStepValue) {
      addToast({
        title: 'No default step confiuration found',
        body: 'If this is a custom step, please add a JSON configuration to the steps library.',
        level: 'error',
        ttl: -1,
      })
      return
    }
    e.dataTransfer.setData('application/json', JSON.stringify(defaultStepValue))
  }

  return (
    <div className={styles.sectionStep}>
      <div
        draggable
        onDragStart={(e) => {
          handleDragStart(e, label)
        }}
      >
        <GripVerticalIcon
          size="1em"
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-600"
        />
        <h3 className={styles.name}>{defaultStep?.metadata?.name ?? label}</h3>
        {defaultStep?.metadata?.description && (
          <p className={styles.description}>{defaultStep.metadata.description}</p>
        )}
      </div>
    </div>
  )
}

export default StepLibrarySectionStep
