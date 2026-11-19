'use client'

import { Button } from '@gruent/libs/frontend/components/core/button'
import { addToast } from '@gruent/libs/frontend/hooks/useToast'
import copyToClipboard from '@gruent/libs/frontend/util/copyToClipboard'
import { FC, useCallback } from 'react'

type Props = {
  name: string
  category: string
  attributes: Record<string, any>
}

const ExportConnectionButton: FC<Props> = ({ name, category, attributes }) => {
  const handleExport = useCallback(async () => {
    const exportData = {
      name,
      category,
      attributes,
    }

    const { error } = await copyToClipboard(JSON.stringify(exportData))

    if (error) {
      addToast({
        title: 'Could not copy to clipboard',
        body: 'This may be due to browser permissions. Please allow copying to clipboard and try again.',
        level: 'error',
      })
    } else {
      addToast({
        title: 'Copied connection to clipboard',
        body: 'The connection has been copied to your clipboard. You can now paste it into the import connection form.',
        level: 'success',
      })
    }
  }, [name, category, attributes])

  return <Button onClick={handleExport}>Export connection</Button>
}

export default ExportConnectionButton
