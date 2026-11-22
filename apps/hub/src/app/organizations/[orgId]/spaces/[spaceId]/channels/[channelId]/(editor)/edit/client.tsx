'use client'

import { FC, useCallback, useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import ChannelEditor from '@gruent/hub/components/organisms/ChannelEditor'
import type { ChannelConfig } from '@gruent/libs/legacy/engine/channels/index'
import { useQuery } from '@tanstack/react-query'
import gruentClient from '@gruent/hub/lib/gruent'
import {
  CircleXIcon,
  ClipboardIcon,
  EllipsisVerticalIcon,
  FileSearchIcon,
  HistoryIcon,
  LoaderCircleIcon,
  MousePointerClickIcon,
  PlusIcon,
  SaveIcon,
  ShareIcon,
  SplineIcon,
  Trash2Icon,
} from 'lucide-react'
import useChannelEditorStore from '@gruent/hub/stores/channelEditorStore'
import StepLibraryPane from '@gruent/hub/components/organisms/ChannelEditor/StepLibraryPane'
import StepOptionsPane from '@gruent/hub/components/organisms/ChannelEditor/StepOptionsPane'
import ChannelOptionsPane from '@gruent/hub/components/organisms/ChannelEditor/ChannelOptionsPane'
import NoteOptionsPane from '@gruent/hub/components/organisms/ChannelEditor/NoteOptionsPane'
import Modal from '@gruent/libs/frontend/components/Modal'
import ExecutionHistory from '@gruent/hub/components/organisms/ChannelEditor/ExecutionHistory'
import InspectorSection from '@gruent/hub/components/organisms/ChannelEditor/InspectorSection'
import { addToast } from '@gruent/libs/frontend/hooks/useToast'
import useChannelConfig from '@gruent/libs/frontend/hooks/useChannelConfig'
import copyToClipboard from '@gruent/libs/frontend/util/copyToClipboard'
import { openModal } from '@gruent/libs/frontend/hooks/useModal'
import Link from 'next/link'
import Image from 'next/image'
import UserMenu from '@gruent/hub/components/layouts/AppShell/UserMenu'
import { BreadcrumbSeparator } from '@gruent/hub/components/layouts/AppShell/Topbar'
import dayjs from 'dayjs'
import { Space } from '@prisma/client'
import { Organization } from '@prisma/client'
import { handleDeleteChannel } from '@gruent/hub/actions/channels'
import { useRouter } from 'next/navigation'
import useAuth from '@gruent/hub/hooks/useAuth'
import { Alert, AlertDescription, AlertTitle } from '@gruent/libs/frontend/components/core/alert'
import { Button } from '@gruent/libs/frontend/components/core/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@gruent/libs/frontend/components/core/dropdown-menu'

const breadcrumbLinkClassName =
  'truncate rounded-md px-2 py-1 text-muted-foreground transition hover:bg-sidebar-accent hover:text-foreground'

type Props = {
  userId: string | null
  orgId: string
  spaceId: string
  channelId: string
  organization: Organization | null
  space: Space | null
}

const ChannelByIdEditClientPage: FC<Props> = ({
  userId,
  orgId,
  spaceId,
  channelId,
  organization,
  space,
}) => {
  const router = useRouter()

  // shortcut hint shown in the actions menu (display only, matches the old ContextMenu)
  const modifierKeySymbol = useMemo(() => {
    if (typeof navigator === 'undefined') return '^'
    return navigator.platform.toLowerCase().includes('mac') ? '⌘' : '^'
  }, [])

  const [previousPublishStatus, setPreviousPublishStatus] = useState<
    'PUBLISHED' | 'INITIALIZING' | 'UNPUBLISHED'
  >()

  const [stepLibraryOpen, setStepLibraryOpen] = useState(true)
  const { accessToken } = useAuth()

  const currentStep = useChannelEditorStore((state) => state.currentStep)
  const currentEdge = useChannelEditorStore((state) => state.currentEdge)
  const currentNote = useChannelEditorStore((state) => state.currentNote)
  const upsertStep = useChannelEditorStore((state) => state.upsertStep)
  const upsertEdge = useChannelEditorStore((state) => state.upsertEdge)
  const upsertNote = useChannelEditorStore((state) => state.upsertNote)
  const channelName = useChannelEditorStore((state) => state.channelName)
  const setChannelName = useChannelEditorStore((state) => state.setChannelName)
  const resetChannelEditorStore = useChannelEditorStore((state) => state.reset)
  const runtime = useChannelEditorStore((state) => state.runtime)
  const setRuntime = useChannelEditorStore((state) => state.setRuntime)
  const channelStatus = useChannelEditorStore((state) => state.status)
  const setChannelStatus = useChannelEditorStore((state) => state.setStatus)
  const steps = useChannelEditorStore((state) => state.steps)
  const edges = useChannelEditorStore((state) => state.edges)
  const notes = useChannelEditorStore((state) => state.notes)
  const removeStep = useChannelEditorStore((state) => state.removeStep)
  const removeEdge = useChannelEditorStore((state) => state.removeEdge)
  const removeNote = useChannelEditorStore((state) => state.removeNote)
  const setCurrentStep = useChannelEditorStore((state) => state.setCurrentStep)
  const setCurrentEdge = useChannelEditorStore((state) => state.setCurrentEdge)
  const setCurrentNote = useChannelEditorStore((state) => state.setCurrentNote)
  const setValidationErrors = useChannelEditorStore((state) => state.setValidationErrors)

  const channelConfig = useChannelConfig(channelId, channelName, runtime, steps, edges, notes)

  const {
    status: getChannelConfigStatus,
    data: channel,
    error: getChannelConfigError,
    refetch: refetchChannel,
  } = useQuery({
    queryKey: ['channels', spaceId, channelId],
    queryFn: async () => {
      if (!accessToken) throw new Error('Invalid auth session.')

      const { data: channel, errors } = await gruentClient(accessToken).channels.get(
        spaceId,
        channelId,
      )

      if (errors && errors.length > 0) throw new Error(errors[0])

      if (!channel) throw new Error('Invalid channel.')

      return channel
    },
  })

  // Reset the channel editor store on initial load
  useEffect(() => {
    resetChannelEditorStore()
  }, [channelId, resetChannelEditorStore])

  // Update steps and edges whenever the database is queried
  useEffect(() => {
    if (!channel) return
    const channelConfig = channel.config as ChannelConfig
    const { nodes: steps, edges, notes, runtime } = channelConfig

    // Set steps
    if (steps) {
      for (const step of steps) {
        upsertStep(step.id, step)
      }
    }

    // Set edges
    if (edges) {
      for (const edge of edges) {
        upsertEdge(edge.id, edge)
      }
    }

    // Set notes
    if (notes) {
      for (const note of notes) {
        upsertNote(note.id, note)
      }
    }

    // Set runtime
    setRuntime(runtime)

    // Set name
    setChannelName(channel.name)
  }, [channel, setChannelName, upsertStep, upsertEdge, upsertNote, setRuntime])

  // When channel status changes, refetch the channel and alert the user
  useEffect(() => {
    refetchChannel()

    if (!previousPublishStatus) return
    switch (channelStatus) {
      case 'UNPUBLISHED':
        if (previousPublishStatus === 'PUBLISHED') {
          addToast({
            title: 'Channel unpublished',
            body: 'This channel has been successfully unpublished. It is no longer running and will not respond until it is published again.',
            level: 'info',
          })
        }

        if (previousPublishStatus === 'INITIALIZING') {
          addToast({
            title: 'Channel publish failed',
            body: "This channel failed to initialize. Check the channel's logs for more information.",
            level: 'error',
          })
        }
        break
      case 'PUBLISHED':
        if (previousPublishStatus === 'INITIALIZING') {
          addToast({
            title: 'Channel published',
            body: 'This channel has been successfully published. It is now running and ready to be used!',
            level: 'info',
          })
        }

        if (previousPublishStatus === 'PUBLISHED') {
          addToast({
            title: 'Could not unpublish channel',
            body: 'Something went wrong while unpublishing the channel. If this problem persists, please contact support.',
            level: 'error',
          })
        }
        break
    }
  }, [channelStatus, refetchChannel, previousPublishStatus])

  // Poll for channel status
  useEffect(() => {
    if (!accessToken) return

    const channelStatusPoller = setInterval(() => {
      gruentClient(accessToken)
        .channels.status(spaceId, channelId)
        .then(({ data: newChannelStatus, errors: channelStatusErrors }) => {
          if (channelStatusErrors) {
            addToast({
              title: 'Could not poll for channel status',
              body: channelStatusErrors[0],
              level: 'error',
              ttl: -1,
            })
          }

          if (newChannelStatus && channelStatus !== newChannelStatus.status) {
            setChannelStatus(newChannelStatus.status)
            setPreviousPublishStatus(channelStatus)
          }
        })
    }, 2e3)

    return () => clearInterval(channelStatusPoller)
  }, [channelId, accessToken, spaceId, channelStatus, setChannelStatus])

  // Handle export button
  const handleCopyChannelConfig = useCallback(async () => {
    const { error } = await copyToClipboard(JSON.stringify(channelConfig, null, 2))

    if (error) {
      addToast({
        title: 'Could not copy to clipboard',
        body: 'This may be due to browser permissions. Please allow copying to clipboard and try again.',
        level: 'error',
      })
    }
  }, [channelConfig])

  // handle save button
  const handleSave = useCallback(async () => {
    if (!accessToken) return

    const { errors } = await gruentClient(accessToken).channels.updateConfig(
      spaceId,
      channelConfig.id,
      channelConfig,
    )

    const { data: validationErrors } = await gruentClient(accessToken).channels.validate(
      spaceId,
      channelConfig,
    )

    setValidationErrors(validationErrors)

    if (errors && errors.length > 0) {
      addToast({
        title: 'Could not update the channel',
        body: errors[0],
        level: 'error',
      })

      return
    }

    addToast({
      title: 'Successfully updated the channel',
      body: 'The channel configuration has successfully been saved as a draft.',
      level: 'success',
    })
  }, [channelConfig, spaceId, accessToken, setValidationErrors])

  // handle publish button
  const handlePublish = useCallback(async () => {
    if (!accessToken) return

    const { errors } = await gruentClient(accessToken).channels.publish(spaceId, channelId)

    if (errors && errors.length > 0) {
      addToast({
        title: 'Could not update the channel',
        body: errors[0],
        level: 'error',
      })

      return
    }
  }, [channelId, spaceId, accessToken])

  // handle unpublish button
  const handleUnpublish = useCallback(async () => {
    if (!accessToken) return

    const { errors } = await gruentClient(accessToken).channels.unpublish(spaceId, channelId)

    if (errors && errors.length > 0) {
      addToast({
        title: 'Could not update the channel',
        body: errors[0],
        level: 'error',
      })

      return
    }
  }, [channelId, spaceId, accessToken])

  const hasSelection = !!(currentStep || currentEdge || currentNote)
  const selectionLabel = currentStep ? 'step' : currentNote ? 'note' : 'connection'

  const handleDeleteSelection = () => {
    if (currentStep) removeStep(currentStep.id)
    if (currentEdge) removeEdge(currentEdge.id)
    if (currentNote) removeNote(currentNote.id)
    setCurrentStep(null)
    setCurrentEdge(null)
    setCurrentNote(null)
  }

  if (getChannelConfigStatus === 'pending') {
    return (
      <div className="flex grow items-center justify-center border-t border-sidebar-border bg-background">
        <LoaderCircleIcon size="3em" className="animate-spin" />
      </div>
    )
  }

  if (getChannelConfigStatus === 'error') {
    return (
      <div className="flex grow items-center justify-center border-t border-sidebar-border bg-background">
        <Alert variant="destructive" className="w-fit max-w-xl">
          <CircleXIcon />
          <AlertTitle>Could not get the channel config</AlertTitle>
          <AlertDescription>{`${getChannelConfigError.message}`}</AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <>
      <header className="flex h-12 shrink-0 items-center gap-2 px-3 text-sm">
        <Link
          href="/dashboard"
          aria-label="Gruent home"
          className="flex size-8 shrink-0 items-center justify-center rounded-md transition hover:bg-sidebar-accent"
        >
          <Image src="/img/logos/app-icon-primary.png" alt="Gruent logo" width={20} height={20} />
        </Link>
        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-0.5">
          <Link href={`/organizations/${orgId}`} className={breadcrumbLinkClassName}>
            {organization?.name ?? 'Organization'}
          </Link>
          <BreadcrumbSeparator />
          <Link
            href={`/organizations/${orgId}/spaces/${spaceId}`}
            title={`Back to ${space?.name ?? 'the space'}`}
            className={breadcrumbLinkClassName}
          >
            {space?.name ?? 'Space'}
          </Link>
          <BreadcrumbSeparator />
          <Link
            href={`/organizations/${orgId}/spaces/${spaceId}/channels/${channelId}`}
            className="truncate rounded-md px-2 py-1 font-medium text-foreground transition hover:bg-sidebar-accent"
          >
            {channel?.name}
          </Link>
        </nav>
        <div className="grow" />
        <div className="flex shrink-0 items-center gap-3">
          <div className="flex items-center gap-1">
            <div className="inset-0 flex items-center justify-center text-xs font-medium">
              <AnimatePresence initial={false} mode="wait">
                {!channelStatus && (
                  <motion.span
                    className="py-1 px-3 rounded-full bg-gray-100 dark:bg-gray-800"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.1 }}
                  >
                    Unknown
                  </motion.span>
                )}
                {channelStatus === 'INITIALIZING' && (
                  <motion.div
                    className="flex items-center gap-1"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.1 }}
                  >
                    <LoaderCircleIcon size="1.3333em" className="animate-spin" />
                    <span className="py-1 px-3 bg-orange-600 text-white rounded-full">
                      Initializing
                    </span>
                  </motion.div>
                )}
                {channelStatus === 'PUBLISHED' && (
                  <motion.span
                    className="py-1 px-3 rounded-full bg-green-600 text-white"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.1 }}
                  >
                    Published
                  </motion.span>
                )}
                {channelStatus === 'UNPUBLISHED' && (
                  <motion.span
                    className="py-1 px-3 rounded-full bg-gray-100 dark:bg-gray-800"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.1 }}
                  >
                    Draft
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
            <button
              className={`
                  relative w-9 h-6 rounded-full transition-colors duration-300
                  ${channelStatus === 'PUBLISHED' ? 'bg-green-600' : 'bg-gray-300 dark:bg-gray-600'}
                  ${!channelStatus || channelStatus === 'INITIALIZING' ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                `}
              onClick={() => {
                if (!channelStatus || channelStatus === 'INITIALIZING') return
                channelStatus === 'PUBLISHED' ? handleUnpublish() : handlePublish()
              }}
              disabled={!channelStatus || channelStatus === 'INITIALIZING'}
            >
              <motion.div
                className="absolute top-1 left-1 w-4 h-4 bg-white rounded-full"
                animate={{
                  x: channelStatus === 'PUBLISHED' ? 12 : 0,
                }}
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              />
            </button>
          </div>
          <p className="hidden text-xs text-muted-foreground lg:block">
            Last saved: {dayjs(channel?.updatedAt).format('M/D/YY')} at{' '}
            {dayjs(channel?.updatedAt).format('hh:mm a')}
          </p>
          <Button variant="outline" size="sm" onClick={handleSave}>
            Save
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground"
            aria-label="Execution history"
            title={`Execution history (${modifierKeySymbol}I)`}
            onClick={() => openModal('channelExecutionsTable')}
          >
            <FileSearchIcon />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground"
            aria-label="Channel versions"
            title="Channel versions"
            onClick={() =>
              addToast({
                title: 'Coming soon',
                body: 'Channel versions are coming soon!',
                level: 'info',
              })
            }
          >
            <HistoryIcon />
          </Button>
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Open actions menu">
                <EllipsisVerticalIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-44">
              <DropdownMenuItem onSelect={() => openModal('exportChannel')}>
                <ShareIcon /> Export
                <DropdownMenuShortcut>{modifierKeySymbol}E</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={handleSave}>
                <SaveIcon /> Save
                <DropdownMenuShortcut>{modifierKeySymbol}S</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => openModal('channelExecutionsTable')}>
                <FileSearchIcon /> Execution history
                <DropdownMenuShortcut>{modifierKeySymbol}I</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onSelect={async () => {
                  const { error } = await handleDeleteChannel(spaceId, channelId)
                  if (error) {
                    addToast({
                      title: 'Could not delete the channel',
                      body: `The channel could not be deleted: ${error}`,
                      level: 'error',
                    })
                  } else {
                    addToast({
                      title: 'Successfully deleted channel',
                      body: 'Successfully deleted the channel from your space.',
                      level: 'success',
                    })
                    router.push(`/organizations/${orgId}/spaces/${spaceId}`)
                  }
                }}
              >
                <Trash2Icon /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {userId && <UserMenu userId={userId} />}
        </div>
      </header>
      <div
        id="channelEditor"
        className="relative flex min-h-0 grow overflow-hidden border-t border-sidebar-border bg-background text-foreground"
      >
        <Modal
          id="channelExecutionsTable"
          title="Execution history"
          showAccept={false}
          showClose={false}
          className="sm:max-w-xl"
        >
          <div className="-mx-7 -my-8">
            <ExecutionHistory
              spaceId={spaceId}
              channelId={channelId}
              channelStatus={channelStatus}
            />
          </div>
        </Modal>
        <Modal
          id="exportChannel"
          title="Export channel"
          description="The channel configuration as JSON."
          showTitle
          showAccept={false}
        >
          <div className="relative rounded-lg border bg-muted/40">
            <Button
              variant="outline"
              size="sm"
              className="absolute top-2 right-2 bg-background"
              onClick={handleCopyChannelConfig}
            >
              <ClipboardIcon /> Copy
            </Button>
            <pre className="max-h-[60vh] overflow-auto p-4 font-mono text-xs">
              {JSON.stringify(channelConfig, null, 2)}
            </pre>
          </div>
        </Modal>

        <AnimatePresence initial={false}>
          {stepLibraryOpen && (
            <motion.aside
              key="stepLibrary"
              className="shrink-0 overflow-hidden border-r bg-background"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 288, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
            >
              <div className="h-full w-72">
                <StepLibraryPane onClose={() => setStepLibraryOpen(false)} />
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        <ChannelEditor
          hooks={{
            onSave: handleSave,
            onExport: () => openModal('exportChannel'),
            onChangeMode: () => openModal('channelExecutionsTable'),
          }}
          toolbar={
            <>
              {!stepLibraryOpen && (
                <Button
                  variant="outline"
                  size="sm"
                  className="bg-background shadow-xs"
                  onClick={() => setStepLibraryOpen(true)}
                >
                  <PlusIcon /> Add step
                </Button>
              )}
              <AnimatePresence initial={false}>
                {hasSelection && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ duration: 0.1 }}
                  >
                    <Button
                      variant="outline"
                      size="sm"
                      className="bg-background shadow-xs hover:text-destructive"
                      aria-label={`Delete selected ${selectionLabel}`}
                      title={`Delete selected ${selectionLabel} (Delete)`}
                      onClick={handleDeleteSelection}
                    >
                      <Trash2Icon /> Delete {selectionLabel}
                    </Button>
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          }
        />

        <aside
          className="w-[360px] xl:w-[400px] shrink-0 border-l bg-background flex flex-col overflow-y-auto"
          data-testid="channel-inspector"
        >
          {currentStep && <StepOptionsPane spaceId={spaceId} />}
          {currentNote && <NoteOptionsPane />}
          {currentEdge && (
            <InspectorSection
              title="Connection"
              description={`${steps.get(currentEdge.from.nodeId)?.metadata.name ?? 'Unknown step'} → ${steps.get(currentEdge.to.nodeId)?.metadata.name ?? 'Unknown step'}`}
              media={
                <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                  <SplineIcon className="size-[18px]" />
                </div>
              }
            />
          )}
          {!hasSelection && (
            <InspectorSection
              title="Nothing selected"
              description="Select a step or note on the canvas to configure it."
              media={
                <div className="flex size-9 shrink-0 items-center justify-center rounded-md border border-dashed text-muted-foreground">
                  <MousePointerClickIcon className="size-[18px]" />
                </div>
              }
            />
          )}
          <ChannelOptionsPane spaceId={spaceId} channel={channel} />
        </aside>
      </div>
    </>
  )
}

export default ChannelByIdEditClientPage
