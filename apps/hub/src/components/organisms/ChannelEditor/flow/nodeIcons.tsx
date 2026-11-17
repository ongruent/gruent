import {
  RemixIcon,
  riBarChartBoxLine,
  riCodeBoxFill,
  riDatabase2Line,
  riFileTextLine,
  riFilter3Fill,
  riFlowChart,
  riFolderCloudLine,
  riNotification4Line,
  riPlayFill,
  riQuestionFill,
  riShapesLine,
  riShareFill,
  riTimerLine,
  riWebhookFill,
} from '@mwarnerdotme/react-remixicon'
import { FC } from 'react'
import type { ChannelNodeType } from './types'

type IconProps = { className?: string }

const MessageQueueIcon: FC<IconProps> = ({ className }) => (
  <svg viewBox="0 0 256 256" fill="currentColor" className={className} aria-hidden>
    <g transform="translate(0,-20)">
      <g transform="matrix(1,0,0,1,28,2)">
        <path d="M144.253,147.119L144.253,141.56C144.253,140.884 144.603,140.257 145.178,139.901C145.753,139.546 146.471,139.513 147.076,139.816L174.11,153.333C174.771,153.663 175.188,154.339 175.188,155.078C175.188,155.816 174.771,156.492 174.11,156.822L147.076,170.339C146.471,170.642 145.753,170.609 145.178,170.254C144.603,169.898 144.253,169.271 144.253,168.595L144.253,163.036L128,163.036C123.605,163.036 120.042,159.473 120.042,155.078C120.042,155.078 120.042,92.334 120.042,79.786L120.042,79.567L26.743,79.567C22.351,79.567 18.785,76.001 18.785,71.609C18.785,67.217 22.351,63.651 26.743,63.651L128,63.651C132.395,63.651 135.958,67.214 135.958,71.609C135.958,71.609 135.958,147.119 135.958,147.119L144.253,147.119Z" />
      </g>
      <g transform="matrix(-1,0,0,-1,175,252)">
        <path d="M144.253,163.036L128,163.036C123.605,163.036 120.042,159.473 120.042,155.078C120.042,155.078 120.042,92.334 120.042,79.786L120.042,79.567L26.743,79.567C22.351,79.567 18.785,76.001 18.785,71.609C18.785,67.217 22.351,63.651 26.743,63.651L128,63.651C132.395,63.651 135.958,67.214 135.958,71.609C135.958,71.609 135.958,147.119 135.958,147.119L144.253,147.119L144.253,141.56C144.253,140.884 144.603,140.257 145.178,139.901C145.753,139.546 146.471,139.513 147.076,139.816L174.11,153.333C174.771,153.663 175.188,154.339 175.188,155.078C175.188,155.816 174.771,156.492 174.11,156.822L147.076,170.339C146.471,170.642 145.753,170.609 145.178,170.254C144.603,169.898 144.253,169.271 144.253,168.595L144.253,163.036Z" />
      </g>
      <circle cx="71.2" cy="128.1" r="13" />
      <circle cx="101.2" cy="128.1" r="13" />
      <circle cx="131.2" cy="128.1" r="13" />
    </g>
  </svg>
)

export const NodeTypeIcon: FC<IconProps & { type: ChannelNodeType }> = ({ type, className }) => {
  switch (type) {
    case 'source':
      return <RemixIcon size="sm" icon={riPlayFill} className={className} />
    case 'processing':
      return <RemixIcon size="sm" icon={riFilter3Fill} className={className} />
    case 'action':
      return <RemixIcon size="sm" icon={riPlayFill} className={`rotate-180 ${className ?? ''}`} />
    case 'conditional':
      return <RemixIcon size="sm" icon={riShareFill} className={className} />
    case 'custom':
      return <RemixIcon size="sm" icon={riCodeBoxFill} className={className} />
    default:
      return <RemixIcon size="sm" icon={riQuestionFill} className={className} />
  }
}

export const NodeLabelIcon: FC<IconProps & { label: string }> = ({ label, className }) => {
  switch (label) {
    case 'mqtt':
    case 'messageQueue':
      return <MessageQueueIcon className={className} />
    case 'http':
    case 'httpResponse':
      return <RemixIcon size="3x" icon={riWebhookFill} className={className} />
    case 'timer':
      return <RemixIcon size="3x" icon={riTimerLine} className={className} />
    case 'fileStorage':
      return <RemixIcon size="3x" icon={riFolderCloudLine} className={className} />
    case 'documentDb':
    case 'timeSeriesDb':
      return <RemixIcon size="3x" icon={riDatabase2Line} className={className} />
    case 'log':
      return <RemixIcon size="3x" icon={riFileTextLine} className={className} />
    case 'metric':
      return <RemixIcon size="3x" icon={riBarChartBoxLine} className={className} />
    case 'notification':
      return <RemixIcon size="3x" icon={riNotification4Line} className={className} />
    case 'boolean':
    case 'stringCompare':
    case 'threshold':
    case 'existence':
      return <RemixIcon size="3x" icon={riFlowChart} className={className} />
    case 'transform':
      return <RemixIcon size="3x" icon={riShapesLine} className={className} />
    default:
      return <RemixIcon size="3x" icon={riQuestionFill} className={className} />
  }
}
