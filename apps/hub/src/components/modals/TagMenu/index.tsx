'use client'

import { Dispatch, FC, SetStateAction, useCallback, useMemo, useRef, useState } from 'react'
import { addToast } from '@gruent/libs/frontend/hooks/useToast'
import { Thing, Model, Channel, Tag, AppliedTag } from '@prisma/client'
import { handleApplyTag, handleCreateTag, handleRemoveTag } from '@gruent/hub/actions/tags'
import { LoaderCircleIcon, PlusIcon, XIcon } from 'lucide-react'
import { useClickOutside } from '@react-hooks-library/core'
import { Badge } from '@gruent/libs/frontend/components/core/badge'
import { Button } from '@gruent/libs/frontend/components/core/button'
import { Input } from '@gruent/libs/frontend/components/core/input'

type Props = {
  spaceId: string
  onClose?: () => void
  onSubmit?: () => void
  subject?: (Thing | Model | Channel) & { tags?: (AppliedTag & { tag: Tag })[] }
  setSubject: Dispatch<SetStateAction<Thing | Model | Channel | undefined>>
  tags: Tag[]
}

const TagMenu: FC<Props> = ({ spaceId, onClose, onSubmit, subject, setSubject, tags }) => {
  const [search, setSearch] = useState('')
  const [isCreateTagLoading, setIsCreateTagLoading] = useState(false)

  const handleClose = useCallback(() => {
    setSearch('')
    setSubject(undefined)

    if (onClose) onClose()
  }, [onClose, setSubject])

  const menuRef = useRef(null)
  useClickOutside(menuRef, () => {
    handleClose()
  })

  const handleClickRemoveTag = useCallback(
    async (tagId: string) => {
      if (!subject) return

      const { error: removeTagError } = await handleRemoveTag(spaceId, tagId, subject.id)
      if (removeTagError) {
        addToast({
          title: 'Could not remove tag',
          body: `${removeTagError}`,
          level: 'error',
        })
        return
      }
    },
    [spaceId, subject],
  )

  const handleClickAvailableTag = useCallback(
    async (spaceId: string, tagId: string) => {
      if (!subject) return

      const { error: applyTagError } = await handleApplyTag(spaceId, tagId, subject.id)
      if (applyTagError) {
        addToast({
          title: 'Could not apply tag',
          body: `${applyTagError}`,
          level: 'error',
        })
        return
      }

      handleClose()
    },
    [subject, handleClose],
  )

  const handleNewTag = useCallback(async () => {
    if (!subject) return

    setIsCreateTagLoading(true)

    if (!search) {
      addToast({
        title: 'Could not create tag',
        body: 'A tag name is required',
        level: 'warning',
      })
      setIsCreateTagLoading(false)
      return
    }

    const { data, error: createTagError } = await handleCreateTag(spaceId, search)
    if (createTagError) {
      addToast({
        title: 'Could not create tag',
        body: `${createTagError}`,
        level: 'error',
      })
      setIsCreateTagLoading(false)
      return
    }

    if (!data) {
      addToast({
        title: 'Could not create tag',
        body: 'An unknown error occurred while creating the tag. No tag was returned from the server. Please contact support.',
        level: 'error',
      })
      setIsCreateTagLoading(false)
      return
    }

    const { tag } = data
    const { error: applyTagError } = await handleApplyTag(spaceId, tag.id, subject.id)

    if (applyTagError) {
      addToast({
        title: 'Could not add tag',
        body: `${applyTagError}`,
        level: 'error',
      })
      setIsCreateTagLoading(false)
      return
    }

    setIsCreateTagLoading(false)
    handleClose()
    if (onSubmit) onSubmit()
  }, [search, spaceId, handleClose, onSubmit, subject])

  const usedTags = useMemo(() => {
    return tags
      .map((tag) => {
        if (!subject || !subject.tags) return null
        if (subject.tags.find((appliedTag) => appliedTag.tagId === tag.id)) return tag
        return null
      })
      .filter((tag) => tag !== null)
  }, [tags, subject])

  const availableTags = useMemo(() => {
    if (!search) return []

    const filteredTags = tags.filter((tag) => {
      // Filter out tags that are already applied to the subject
      if (usedTags.find((usedTag) => usedTag.id === tag.id)) return false

      // Filter out tags that don't match the search query
      if (!tag.name.toLowerCase().includes(search.toLowerCase())) return false

      return true
    })

    return filteredTags.slice(0, 5)
  }, [tags, usedTags, search])

  const shouldShowCreateTag = useMemo(() => {
    return search.length > 0 && !tags.find((tag) => tag.name.toLowerCase() === search.toLowerCase())
  }, [search, tags])

  return (
    <>
      {subject && (
        <div
          ref={menuRef}
          className="absolute w-[300px] top-0 left-0 w-fit p-3 border bg-popover text-popover-foreground shadow-md rounded-md z-10"
        >
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Close tag menu"
            className="absolute top-0 right-0"
            onClick={() => setSubject(undefined)}
          >
            <XIcon />
          </Button>
          <div className="flex flex-wrap gap-2 items-center pr-5">
            {usedTags.map((tag) => (
              <Badge key={tag.id} variant="secondary" className="gap-0.5 pr-0.5">
                {tag.name}
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Remove tag ${tag.name}`}
                  className="size-4 rounded-full"
                  onClick={() => handleClickRemoveTag(tag.id)}
                >
                  <XIcon className="size-3" />
                </Button>
              </Badge>
            ))}
            <Input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 flex-1 min-w-[100px] text-sm"
              placeholder="Add tags..."
              aria-label="Search tags"
            />
          </div>
          <div className="flex flex-col gap-1 mt-2">
            {availableTags.map((tag) => (
              <Button
                key={tag.id}
                variant="ghost"
                size="sm"
                className="w-full justify-start font-normal"
                onClick={() => handleClickAvailableTag(spaceId, tag.id)}
              >
                {tag.name}
              </Button>
            ))}
            {shouldShowCreateTag && isCreateTagLoading && (
              <Button variant="ghost" size="sm" className="w-full justify-start" disabled>
                <LoaderCircleIcon className="animate-spin" />
              </Button>
            )}
            {shouldShowCreateTag && !isCreateTagLoading && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start font-normal"
                onClick={() => handleNewTag()}
              >
                Create {search} <PlusIcon />
              </Button>
            )}
          </div>
        </div>
      )}
    </>
  )
}

export default TagMenu
