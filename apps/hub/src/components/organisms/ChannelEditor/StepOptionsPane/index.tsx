'use client'

import useChannelEditorStore from '@gruent/hub/stores/channelEditorStore'
import { FC } from 'react'
import HttpActionOptions from './HttpAction'
import HttpSourceOptions from './HttpSource'
import MqttActionOptions from './MqttAction'
import TransformProcessingOptions from './TransformProcessing'
import MqttSourceOptions from './MqttSource'
import ThresholdConditionalOptions from './ThresholdConditional'
import TimerSourceOptions from './TimerSource'
import FileStorageActionOptions from './FileStorageAction'
import MessageQueueActionOptions from './MessageQueueAction'
import TimeSeriesDbActionOptions from './TimeSeriesDbAction'
import MessageQueueSourceOptions from './MessageQueueSource'
import NotificationActionOptions from './NotificationAction'
import DocumentDbActionOptions from './DocumentDbAction'
import ExistenceConditionalOptions from './ExistenceConditional'
import StringCompareConditionalOptions from './StringCompareConditional'
import BooleanConditionalOptions from './BooleanConditional'
import HttpResponseActionOptions from './HttpResponseAction'
import MetricActionOptions from './MetricAction'

type Props = {
  spaceId: string
  orgId: string
  channelId: string
}

const StepOptionsPane: FC<Props> = ({ spaceId, orgId, channelId }) => {
  // Set up store
  const currentStep = useChannelEditorStore((state) => state.currentStep)
  const validationErrors = useChannelEditorStore((state) => state.validationErrors)
  const models = useChannelEditorStore((state) => state.models)
  const connections = useChannelEditorStore((state) => state.connections)

  const stepOptions = {
    source: {
      http: <HttpSourceOptions channelId={channelId} />,
      mqtt: <MqttSourceOptions connections={connections} spaceId={spaceId} orgId={orgId} />,
      messageQueue: (
        <MessageQueueSourceOptions connections={connections} spaceId={spaceId} orgId={orgId} />
      ),
      timer: <TimerSourceOptions />,
    },
    processing: {
      transform: <TransformProcessingOptions models={models} spaceId={spaceId} orgId={orgId} />,
    },
    conditional: {
      threshold: <ThresholdConditionalOptions models={models} spaceId={spaceId} orgId={orgId} />,
      existence: <ExistenceConditionalOptions models={models} />,
      stringCompare: (
        <StringCompareConditionalOptions models={models} spaceId={spaceId} orgId={orgId} />
      ),
      boolean: <BooleanConditionalOptions models={models} spaceId={spaceId} orgId={orgId} />,
    },
    action: {
      http: <HttpActionOptions connections={connections} spaceId={spaceId} orgId={orgId} />,
      httpResponse: (
        <HttpResponseActionOptions connections={connections} spaceId={spaceId} orgId={orgId} />
      ),
      mqtt: <MqttActionOptions connections={connections} spaceId={spaceId} orgId={orgId} />,
      messageQueue: (
        <MessageQueueActionOptions connections={connections} spaceId={spaceId} orgId={orgId} />
      ),
      fileStorage: (
        <FileStorageActionOptions connections={connections} spaceId={spaceId} orgId={orgId} />
      ),
      timeSeriesDb: (
        <TimeSeriesDbActionOptions connections={connections} spaceId={spaceId} orgId={orgId} />
      ),
      notification: (
        <NotificationActionOptions
          models={models}
          connections={connections}
          spaceId={spaceId}
          orgId={orgId}
        />
      ),
      documentDb: (
        <DocumentDbActionOptions
          models={models}
          connections={connections}
          spaceId={spaceId}
          orgId={orgId}
        />
      ),
      log: <></>,
      metric: (
        <MetricActionOptions
          models={models}
          connections={connections}
          orgId={orgId}
          spaceId={spaceId}
        />
      ),
    },
    invalid: <p>The selected step is invalid.</p>,
  }

  return (
    <div className="px-8 py-4 text-sm">
      <h2 className="uppercase text-gray-500 font-bold text-xs mb-2">Step Options</h2>
      {currentStep && (
        <>
          {/* Select the specific options component to render */}
          {stepOptions[currentStep.metadata.type][currentStep.metadata.label] ??
            stepOptions.invalid}
        </>
      )}
      {validationErrors &&
        validationErrors.stepErrors &&
        currentStep &&
        validationErrors.stepErrors[currentStep.id] &&
        validationErrors.stepErrors[currentStep.id].length > 0 && (
          <div className="mt-4">
            <h2 className="uppercase text-gray-500 font-bold text-xs mb-2">Step Errors</h2>
            <ul className="list-disc list-inside">
              {validationErrors.stepErrors[currentStep.id].map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </div>
        )}
    </div>
  )
}

export default StepOptionsPane
