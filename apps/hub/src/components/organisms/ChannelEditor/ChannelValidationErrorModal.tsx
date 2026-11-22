'use client'

import useChannelEditorStore from '@gruent/hub/stores/channelEditorStore'
import Modal from '@gruent/libs/frontend/components/Modal'
import { CircleAlertIcon, CircleCheckIcon } from 'lucide-react'

const ChannelValidationErrorModal = () => {
  const validationErrors = useChannelEditorStore((state) => state.validationErrors)
  const channelErrors = validationErrors?.channelErrors ?? []

  return (
    <Modal
      id="channelValidationErrors"
      title="Channel issues"
      description="Problems with the channel as a whole. Issues with a single step are shown when the step is selected."
      showTitle
      showAccept={false}
    >
      {channelErrors.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {channelErrors.map((ve, i) => (
            <li
              key={i}
              className="flex gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm"
            >
              <CircleAlertIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
              {ve}
            </li>
          ))}
        </ul>
      ) : (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <CircleCheckIcon className="size-4 text-green-600" />
          This channel is valid and ready to publish!
        </p>
      )}
    </Modal>
  )
}

export default ChannelValidationErrorModal
