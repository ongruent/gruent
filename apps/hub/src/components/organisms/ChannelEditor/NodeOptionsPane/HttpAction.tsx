import useChannelEditorStore from '@gruent/hub/stores/channelEditorStore'
import { ChannelNode } from '@gruent/libs/legacy/engine/nodes/v1'
import {
  HttpActionNodeConfig,
  HttpMethod,
} from '@gruent/libs/legacy/engine/nodes/v1/src/action/http'
import { Thing } from '@prisma/client'
import { FC, useEffect, useMemo, useState } from 'react'
import { openModal } from '@gruent/libs/frontend/hooks/useModal'
import { PlusIcon, XIcon } from 'lucide-react'
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
  things: Thing[]
  orgId: string
  spaceId: string
}

const HttpActionOptions: FC<Props> = ({ things }) => {
  const upsertNode = useChannelEditorStore((state) => state.upsertNode)
  const currentNode = useChannelEditorStore(
    (state) => state.currentNode as ChannelNode<HttpActionNodeConfig>,
  )

  const [selectedHttpServer, setSelectedHttpServer] = useState<Thing>()
  const [selectedHttpServerPath, setSelectedHttpServerPath] = useState<string>()
  const [selectedMethod, setSelectedMethod] = useState<HttpMethod>()

  // load in default values
  useEffect(() => {
    const currentConfig = { ...currentNode.metadata.config }
    if (!things) return

    const thing = things.find((thing) => {
      if (thing.id === currentConfig['httpServer::thing']) return true
      return false
    })

    setSelectedHttpServer(thing)
    setSelectedHttpServerPath(currentConfig.path)
    setSelectedMethod(currentConfig.method || HttpMethod.GET)
  }, [currentNode, things])

  // update config and dependencies when options have been updated
  useEffect(() => {
    if (!selectedHttpServer) return
    if (!selectedHttpServerPath) return
    if (!selectedMethod) return

    // update config
    const updatedNode = structuredClone(currentNode)

    updatedNode.metadata.config = {
      'httpServer::thing': selectedHttpServer.id,
      method: selectedMethod,
      path: selectedHttpServerPath,
    }

    // update dependencies array
    let httpServerThingDependencyIndex = updatedNode.metadata.dependencies.things.findIndex(
      (d) => d.fieldName && d.fieldName === 'httpServer::thing',
    )
    if (httpServerThingDependencyIndex < 0)
      httpServerThingDependencyIndex = updatedNode.metadata.dependencies.things.length

    updatedNode.metadata.dependencies.things[httpServerThingDependencyIndex] = {
      fieldName: 'httpServer::thing',
      internal: false,
      thingId: selectedHttpServer.id,
    }

    // apply updates to the nodes map
    upsertNode(currentNode.id, updatedNode)

    // eslint-disable-next-line -- currentNode in the dependencies array causes node configs to sometimes be copied
  }, [selectedHttpServer, selectedHttpServerPath, selectedMethod, upsertNode])

  const httpServers = useMemo(() => {
    if (!things) return []

    return things.filter((thing) => {
      if (thing.thingCategory == 'HTTP_SERVER') return true
      return false
    })
  }, [things])

  const httpServerOptions = useMemo(() => {
    return httpServers.map((httpServer) => ({
      label: httpServer.name,
      value: httpServer.id,
    }))
  }, [httpServers])

  const selectedHttpServerPathOptions = useMemo(() => {
    if (!selectedHttpServer) return []
    if (!selectedHttpServer.attributes) return []
    const attributes = JSON.parse(selectedHttpServer.attributes as string)
    if (!attributes.paths) return []

    return attributes.paths.map((path) => ({
      label: path,
      value: path,
    }))
  }, [selectedHttpServer])

  if (!httpServers || httpServers.length <= 0)
    return (
      <p className="mb-2">
        <Button variant="link" onClick={() => openModal('createThing')}>
          Add an HTTP server
        </Button>{' '}
        to your space before using this node.
      </p>
    )

  return (
    <>
      <div className="flex flex-row items-end gap-2">
        <Field className="my-3 grow">
          <FieldLabel htmlFor="httpServer::thing">HTTP Server</FieldLabel>
          <Select
            name="httpServer::thing"
            value={selectedHttpServer?.id ?? ''}
            onValueChange={(value) =>
              setSelectedHttpServer(
                httpServers.find((s) => {
                  if (s.id === value) return true
                  return false
                }),
              )
            }
          >
            <SelectTrigger id="httpServer::thing" className="w-full">
              <SelectValue placeholder="Select an option" />
            </SelectTrigger>
            <SelectContent>
              {httpServerOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Button
          size="icon"
          aria-label="Create thing"
          className="my-3"
          onClick={() => openModal('createThing')}
        >
          <PlusIcon />
        </Button>
      </div>
      <Field className="my-3">
        <FieldLabel htmlFor="path">Path (optional)</FieldLabel>
        <div className="flex items-center gap-2">
          <Select
            name="path"
            value={selectedHttpServerPath ?? ''}
            onValueChange={(value) => setSelectedHttpServerPath(value)}
            disabled={!selectedHttpServer}
          >
            <SelectTrigger id="path" className="w-full">
              <SelectValue placeholder="Select an option" />
            </SelectTrigger>
            <SelectContent>
              {selectedHttpServerPathOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedHttpServerPath && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Clear selection"
              onClick={() => setSelectedHttpServerPath('')}
            >
              <XIcon />
            </Button>
          )}
        </div>
      </Field>
      <Field className="my-3">
        <FieldLabel htmlFor="method">Method</FieldLabel>
        <Select
          name="method"
          value={selectedMethod ?? ''}
          onValueChange={(value) => setSelectedMethod(value as HttpMethod)}
        >
          <SelectTrigger id="method" className="w-full">
            <SelectValue placeholder="Select an option" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="GET">GET</SelectItem>
            <SelectItem value="POST">POST</SelectItem>
            <SelectItem value="PUT">PUT</SelectItem>
            <SelectItem value="DELETE">DELETE</SelectItem>
            <SelectItem value="HEAD">HEAD</SelectItem>
            <SelectItem value="PATCH">PATCH</SelectItem>
          </SelectContent>
        </Select>
      </Field>
    </>
  )
}

export default HttpActionOptions
