'use client'

import { Button } from '@gruent/libs/frontend/components/core/button'
import { Input } from '@gruent/libs/frontend/components/core/input'
import { cn } from 'cn'
import { SearchIcon, XIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { FC, useEffect, useState } from 'react'

type Props = {
  paramKey?: string
  className?: string
  initialFilter?: string
  placeholder?: string
  onChange?: (filter: string) => void
}

const SearchBar: FC<Props> = ({
  paramKey = 'q',
  className,
  initialFilter,
  placeholder,
  onChange,
}) => {
  const router = useRouter()

  const [search, setSearch] = useState<string>(initialFilter ?? '')

  useEffect(() => {
    if (search) {
      const newLocation = new URL(window.location.toString())
      newLocation.searchParams.set(paramKey, search)
      router.replace(newLocation.toString())
    } else {
      const newLocation = new URL(window.location.toString())
      newLocation.searchParams.delete(paramKey)
      router.replace(newLocation.toString())
    }

    if (onChange) onChange(search)
  }, [search, router, paramKey, onChange])

  return (
    <div className="relative">
      <SearchIcon size="1em" className="absolute left-1 top-1/2 -translate-y-1/2 text-gray-500" />
      {search && (
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Clear search"
          className="absolute right-1 top-1/2 -translate-y-1/2 text-gray-500"
          onClick={() => setSearch('')}
        >
          <XIcon />
        </Button>
      )}
      <Input
        type="text"
        aria-label={placeholder ?? 'Search'}
        onChange={(e) => setSearch(e.target.value)}
        value={search}
        placeholder={placeholder}
        className={cn(
          'h-auto px-8 py-1 rounded-none border-0 border-b shadow-none bg-transparent dark:bg-transparent focus-visible:ring-0 focus-visible:border-gray-700 border-gray-200 hover:border-gray-300 text-sm text-gray-700',
          className,
        )}
      />
    </div>
  )
}

export default SearchBar
