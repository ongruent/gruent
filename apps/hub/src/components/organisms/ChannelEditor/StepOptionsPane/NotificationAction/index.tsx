import useChannelEditorStore from '@gruent/hub/stores/channelEditorStore'
import { ChannelNode } from '@gruent/libs/legacy/engine/nodes/v1'
import { NotificationActionNodeConfig } from '@gruent/libs/engine/nodes/v1/src/action/notification'
import { Connection, Model } from '@prisma/client'
import { FC, useEffect, useMemo, useState } from 'react'
import AwsSESActionOptions from './AwsSESActionOptions'
import AwsSNSActionOptions from './AwsSNSActionOptions'
import SendgridActionOptions from './SendgridActionOptions'
import { openModal } from '@gruent/libs/frontend/hooks/useModal'
import { PlusIcon } from 'lucide-react'
import { Button } from '@gruent/libs/frontend/components/core/button'
import { Field, FieldLabel } from '@gruent/libs/frontend/components/core/field'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@gruent/libs/frontend/components/core/select'

type Props = {
  connections: Connection[]
  orgId: string
  spaceId: string
  models: Model[]
}

export enum Notification {
  AWS_SES_ENDPOINT = 'AWS_SES_ENDPOINT',
  AWS_SNS_ENDPOINT = 'AWS_SNS_ENDPOINT',
  SENDGRID_CLIENT = 'SENDGRID_CLIENT',
}

const NotificationActionOptions: FC<Props> = ({ connections, orgId, spaceId, models }) => {
  // Accessing the current step in the editor store
  const currentStep = useChannelEditorStore(
    (state) => state.currentStep as ChannelNode<NotificationActionNodeConfig>,
  )

  // State to hold the selected notification connection (AWS SES or SNS) and selected Model
  const [selectedNotificationConnection, setSelectedNotificationConnection] = useState<Connection>()

  // Load initial config
  useEffect(() => {
    const currentConfig = { ...currentStep.metadata.config }
    if (!connections || !models) return

    // Check if an AWS SES connection is already selected in the config
    if (Object.keys(currentConfig).includes('awsSES::thing')) {
      const awsSES = connections.find((s) => {
        if (s.id === currentConfig['awsSES::thing']) return true
        return false
      })
      if (awsSES) setSelectedNotificationConnection(awsSES)
      return
    }

    // Check if an AWS SNS connection is already selected in the config
    if (Object.keys(currentConfig).includes('awsSNS::thing')) {
      const awsSNS = connections.find((s) => {
        if (s.id === currentConfig['awsSNS::thing']) return true
        return false
      })
      if (awsSNS) setSelectedNotificationConnection(awsSNS)
      return
    }

    // Check if a Sendgrid client connection is already selected in the config
    if (Object.keys(currentConfig).includes('sendgridClient::thing')) {
      const sendgridClient = connections.find((s) => {
        if (s.id === currentConfig['sendgridClient::thing']) return true
        return false
      })
      if (sendgridClient) setSelectedNotificationConnection(sendgridClient)
      return
    }
  }, [currentStep, connections, models])

  // Determine the notification type based on the selected connection
  const selectedNotificationType = useMemo(() => {
    if (!selectedNotificationConnection) return

    if (selectedNotificationConnection.connectionCategory === 'AWS_SES_ENDPOINT')
      return Notification.AWS_SES_ENDPOINT

    if (selectedNotificationConnection.connectionCategory === 'AWS_SNS_ENDPOINT')
      return Notification.AWS_SNS_ENDPOINT

    if (selectedNotificationConnection.connectionCategory === 'SENDGRID_CLIENT')
      return Notification.SENDGRID_CLIENT
  }, [selectedNotificationConnection])

  // Generate a filtered list of available notification types (SES or SNS)
  const notificationConnections = useMemo(() => {
    if (!connections) return []

    const awsSES = connections.filter((connection) => {
      if (connection.connectionCategory == 'AWS_SES_ENDPOINT') return true
      return false
    })

    const awsSNS = connections.filter((connection) => {
      if (connection.connectionCategory == 'AWS_SNS_ENDPOINT') return true
      return false
    })

    const sendgridClients = connections.filter((connection) => {
      if (connection.connectionCategory == 'SENDGRID_CLIENT') return true
      return false
    })

    return [...awsSES, ...awsSNS, ...sendgridClients]
  }, [connections])

  // Generate options for the NotificationType dropdown
  const notificationOptions = useMemo(() => {
    return notificationConnections.map((connection) => ({
      label: connection.name,
      value: connection.id,
    }))
  }, [notificationConnections])

  // Conditionally rendering subnode options based on the selected type (SES/SNS)
  const selectedSubnodeOptions = useMemo(() => {
    if (!selectedNotificationConnection) return

    switch (selectedNotificationType) {
      case Notification.AWS_SES_ENDPOINT:
        return (
          <AwsSESActionOptions
            connections={connections}
            orgId={orgId}
            spaceId={spaceId}
            selectedNotificationConnection={selectedNotificationConnection}
            models={models}
          />
        )
      case Notification.AWS_SNS_ENDPOINT:
        return (
          <AwsSNSActionOptions
            connections={connections}
            orgId={orgId}
            spaceId={spaceId}
            selectedNotificationConnection={selectedNotificationConnection}
            models={models}
          />
        )
      case Notification.SENDGRID_CLIENT:
        return (
          <SendgridActionOptions
            connections={connections}
            orgId={orgId}
            spaceId={spaceId}
            selectedNotificationConnection={selectedNotificationConnection}
            models={models}
          />
        )
      default:
        return
    }
  }, [
    models,
    selectedNotificationType,
    selectedNotificationConnection,
    connections,
    orgId,
    spaceId,
  ])

  if (!notificationConnections || notificationConnections.length <= 0)
    return (
      <p className="mb-2">
        <Button variant="link" onClick={() => openModal('createConnection')}>
          Add a notification client
        </Button>{' '}
        to your space before using this step.
      </p>
    )

  return (
    <>
      <div className="flex flex-row items-end gap-2">
        <Field className="my-3 grow">
          <FieldLabel htmlFor="NotificationConnection">Notification Connection</FieldLabel>
          <Select
            name="NotificationConnection"
            value={selectedNotificationConnection?.id ?? ''}
            onValueChange={(value) =>
              setSelectedNotificationConnection(
                notificationConnections.find((s) => {
                  if (s.id === value) return true
                  return false
                }),
              )
            }
          >
            <SelectTrigger id="NotificationConnection" className="w-full">
              <SelectValue placeholder="Select an option" />
            </SelectTrigger>
            <SelectContent>
              {notificationOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Button
          size="icon"
          aria-label="Create connection"
          className="my-3"
          onClick={() => openModal('createConnection')}
        >
          <PlusIcon />
        </Button>
      </div>
      {selectedSubnodeOptions}
    </>
  )
}

export default NotificationActionOptions
