import { Alert, AlertDescription, AlertTitle } from '@gruent/libs/frontend/components/core/alert'
import { CircleXIcon } from 'lucide-react'
import { FC } from 'react'

type Props = {
  title: string
  description: string
}

const ErrorAlert: FC<Props> = ({ title, description }) => (
  <Alert variant="destructive" className="w-fit max-w-xl">
    <CircleXIcon />
    <AlertTitle>{title}</AlertTitle>
    <AlertDescription>{description}</AlertDescription>
  </Alert>
)

export default ErrorAlert
