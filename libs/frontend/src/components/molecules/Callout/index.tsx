import { CircleXIcon, InfoIcon, TriangleAlertIcon } from 'lucide-react'

type Props = {
  title: string
  description: string
  variant: 'info' | 'warning' | 'error'
  className?: string
}

const Callout = ({ title, description, variant, className }: Props) => {
  const Icon = (() => {
    switch (variant) {
      case 'info':
        return InfoIcon
      case 'warning':
        return TriangleAlertIcon
      case 'error':
        return CircleXIcon
    }
  })()

  const borderColor = (() => {
    switch (variant) {
      case 'info':
        return 'blue-500'
      case 'warning':
        return 'yellow-500'
      case 'error':
        return 'red-500'
    }
  })()

  const backgroundColor = (() => {
    switch (variant) {
      case 'info':
        return 'bg-blue-100'
      case 'warning':
        return 'bg-yellow-100'
      case 'error':
        return 'bg-red-100'
    }
  })()

  const titleColor = (() => {
    switch (variant) {
      case 'info':
        return 'text-blue-700!'
      case 'warning':
        return 'text-yellow-700!'
      case 'error':
        return 'text-red-700!'
    }
  })()

  return (
    <div
      className={`flex w-fit py-4 pl-4 pr-6 rounded-sm overflow-hidden border border-${borderColor} ${backgroundColor} ${className ? className : ''}`}
    >
      <div>
        <Icon size="1em" className={`mr-3 text-${borderColor}`} />
      </div>
      <div>
        <h3 className={`font-bold ${titleColor} text-sm`}>{title}</h3>
        <p className={`${titleColor} text-sm`}>{description}</p>
      </div>
    </div>
  )
}

export default Callout
