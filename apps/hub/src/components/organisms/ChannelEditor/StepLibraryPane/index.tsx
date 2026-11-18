import { DragEvent, FC, useMemo, useState } from 'react'
import StepLibrarySection from './StepLibrarySection'
import { ChannelNodeType, defaultNodes } from '@gruent/libs/legacy/engine/nodes/v1'
import { ScrollTextIcon, SearchIcon, XIcon } from 'lucide-react'

const StepLibraryPane: FC = () => {
  const [searchQuery, setSearchQuery] = useState<string>()
  const [openSections, setOpenSections] = useState<ChannelNodeType[]>([])

  const handleTitleClick = (stepType: ChannelNodeType) => {
    setOpenSections((current) => {
      if (current.includes(stepType)) {
        return current.filter((nt) => {
          if (nt === stepType) return false
          return true
        })
      } else {
        return [...current, stepType]
      }
    })
  }

  const handleNoteDragStart = (e: DragEvent<HTMLDivElement>) => {
    const defaultNoteValue = {
      id: '__GRUENT_NOTE__',
      coordinates: {
        x: 0,
        y: 0,
      },
      text: '',
    }
    e.dataTransfer.setData('application/json', JSON.stringify(defaultNoteValue))
  }

  const availableSteps = useMemo(() => {
    if (!searchQuery) return Array.from(defaultNodes.entries())

    return Array.from(defaultNodes.entries()).filter(([stepName]) => {
      if (stepName.toLowerCase().includes(searchQuery.toLowerCase())) return true
      return false
    })
  }, [searchQuery])

  return (
    <div className="flex flex-col w-full min-w-56 overflow-y-scroll overflow-x-hidden">
      <h2 className="uppercase text-gray-500 dark:text-gray-100 font-bold text-xs mb-2 pt-px">
        Steps
      </h2>
      <div className="flex relative w-full items-bottom mb-2">
        <SearchIcon size=".875em" className="mr-1 text-gray-700" />
        <input
          name="stepSearch"
          type="text"
          autoComplete="off"
          autoCorrect="off"
          spellCheck="false"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="outline-hidden border-0 border-b bg-transparent transition border-gray-400 hover:border-gray-800 focus:border-gray-800 text-xs mt-0 grow"
        />
        {searchQuery && searchQuery.length > 0 && (
          <XIcon
            size="1em"
            onClick={() => setSearchQuery('')}
            className="absolute right-0 t-1/2 cursor-pointer"
          />
        )}
      </div>
      <StepLibrarySection
        availableSteps={availableSteps}
        stepType="source"
        open={openSections.includes('source') || availableSteps.length <= 5}
        onTitleClick={() => handleTitleClick('source')}
      />
      <StepLibrarySection
        availableSteps={availableSteps}
        stepType="processing"
        open={openSections.includes('processing') || availableSteps.length <= 5}
        onTitleClick={() => handleTitleClick('processing')}
      />
      <StepLibrarySection
        availableSteps={availableSteps}
        stepType="conditional"
        open={openSections.includes('conditional') || availableSteps.length <= 5}
        onTitleClick={() => handleTitleClick('conditional')}
      />
      <StepLibrarySection
        availableSteps={availableSteps}
        stepType="action"
        open={openSections.includes('action') || availableSteps.length <= 5}
        onTitleClick={() => handleTitleClick('action')}
      />
      <div className="grow" />
      <hr className="my-2" />
      <section>
        <div
          draggable
          className="my-1 px-1 select-none dark:text-gray-200 text-sm cursor-grab flex items-center"
          onDragStart={(e) => handleNoteDragStart(e)}
        >
          <ScrollTextIcon size="1em" className="mr-1" />
          <span>Note</span>
        </div>
      </section>
    </div>
  )
}

export default StepLibraryPane
