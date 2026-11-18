import {
  BellIcon,
  ChartColumnBigIcon,
  CircleQuestionMarkIcon,
  DatabaseIcon,
  FileTextIcon,
  FolderIcon,
  ListFilterIcon,
  PlayIcon,
  ShapesIcon,
  Share2Icon,
  SquareCodeIcon,
  TimerIcon,
  WebhookIcon,
  WorkflowIcon,
} from 'lucide-react'
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

export const StepTypeIcon: FC<IconProps & { type: ChannelNodeType }> = ({ type, className }) => {
  switch (type) {
    case 'source':
      return <PlayIcon size=".875em" className={className} />
    case 'processing':
      return <ListFilterIcon size=".875em" className={className} />
    case 'action':
      return <PlayIcon size=".875em" className={`rotate-180 ${className ?? ''}`} />
    case 'conditional':
      return <Share2Icon size=".875em" className={className} />
    case 'custom':
      return <SquareCodeIcon size=".875em" className={className} />
    default:
      return <CircleQuestionMarkIcon size=".875em" className={className} />
  }
}

export const StepLabelIcon: FC<IconProps & { label: string }> = ({ label, className }) => {
  switch (label) {
    case 'mqtt':
    case 'messageQueue':
      return <MessageQueueIcon className={className} />
    case 'http':
    case 'httpResponse':
      return <WebhookIcon size="3em" className={className} />
    case 'timer':
      return <TimerIcon size="3em" className={className} />
    case 'fileStorage':
      return <FolderIcon size="3em" className={className} />
    case 'documentDb':
    case 'timeSeriesDb':
      return <DatabaseIcon size="3em" className={className} />
    case 'log':
      return <FileTextIcon size="3em" className={className} />
    case 'metric':
      return <ChartColumnBigIcon size="3em" className={className} />
    case 'notification':
      return <BellIcon size="3em" className={className} />
    case 'boolean':
    case 'stringCompare':
    case 'threshold':
    case 'existence':
      return <WorkflowIcon size="3em" className={className} />
    case 'transform':
      return <ShapesIcon size="3em" className={className} />
    default:
      return <CircleQuestionMarkIcon size="3em" className={className} />
  }
}
