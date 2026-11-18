import {
  CircleQuestionMarkIcon,
  ListFilterIcon,
  PlayIcon,
  ShapesIcon,
  Share2Icon,
  SquareCodeIcon,
  WebhookIcon,
  WorkflowIcon,
  ZapIcon,
} from 'lucide-react'
import { FC } from 'react'
import type { ChannelNodeType } from './types'

type IconProps = { className?: string }

export const NodeTypeIcon: FC<IconProps & { type: ChannelNodeType }> = ({ type, className }) => {
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

/** Large icon for a node on the canvas. Chosen by category only; there is no per-plugin artwork. */
export const NodeCategoryIcon: FC<IconProps & { type: ChannelNodeType }> = ({
  type,
  className,
}) => {
  switch (type) {
    case 'source':
      return <WebhookIcon size="3em" className={className} />
    case 'processing':
      return <ShapesIcon size="3em" className={className} />
    case 'action':
      return <ZapIcon size="3em" className={className} />
    case 'conditional':
      return <WorkflowIcon size="3em" className={className} />
    case 'custom':
      return <SquareCodeIcon size="3em" className={className} />
    default:
      return <CircleQuestionMarkIcon size="3em" className={className} />
  }
}
