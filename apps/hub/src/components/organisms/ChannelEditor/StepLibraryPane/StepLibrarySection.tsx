'use client'

import { ChannelNodeType } from '@gruent/libs/legacy/engine/nodes/v1'
import { ChevronRightIcon } from 'lucide-react'
import { FC, useMemo } from 'react'
import StepLibrarySectionStep from './StepLibrarySectionStep'

type Props = {
  stepType: ChannelNodeType
  open: boolean
  availableSteps: any[]
  onTitleClick: () => void
}

const StepLibrarySection: FC<Props> = ({ stepType, open, availableSteps, onTitleClick }) => {
  const sectionSteps = availableSteps.filter(([_stepName, step]) => {
    if (step.metadata.type === stepType) return true
    return false
  })

  const sectionTitle = useMemo(() => {
    const titleArray = stepType.split('')
    titleArray[0] = titleArray[0].toUpperCase()
    return titleArray.join('')
  }, [stepType])

  if (sectionSteps.length <= 0) return null

  return (
    <section>
      <div className="flex items-center cursor-pointer select-none" onClick={onTitleClick}>
        <ChevronRightIcon
          size="1em"
          className={`mr-1 transition transform duration-200 ${open ? 'rotate-90 text-gray-700 dark:text-gray-500' : 'text-gray-600 dark:text-gray-400'}`}
        />
        <h3 className={`transition text-sm font-semibold ${open ? 'text-gray-700' : ''}`}>
          {sectionTitle}
        </h3>
      </div>
      {open && (
        <div>
          {sectionSteps.map(([key, defaultStep]) => {
            // Skip the HTTP Response action step as it is rendered in the HTTP Source step options pane
            if (key === 'HTTP Response-action') return null

            return <StepLibrarySectionStep key={key} label={key} defaultStep={defaultStep} />
          })}
        </div>
      )}
    </section>
  )
}

export default StepLibrarySection
