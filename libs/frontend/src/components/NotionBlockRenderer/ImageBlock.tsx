'use client'

import { ImageBlockObjectResponse } from '@notionhq/client/build/src/api-endpoints'
import { Dialog, DialogClose, DialogContent, DialogTitle, DialogTrigger } from '../core/dialog'

const ImageBlock = ({ block }: { block: ImageBlockObjectResponse }) => {
  const imageUrl = (() => {
    if (block.image.type === 'file') return block.image.file.url
    if (block.image.type === 'external') return block.image.external.url
    return null
  })()

  if (!imageUrl) return null

  const caption = block.image.caption?.[0]?.plain_text

  return (
    <Dialog>
      <DialogTrigger asChild>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={block.id}
          src={imageUrl}
          alt={caption || ''}
          className="rounded-md shadow-md cursor-zoom-in"
        />
      </DialogTrigger>
      {caption && <p className="text-sm text-gray-600 my-1">{caption}</p>}
      <DialogContent
        showCloseButton={false}
        className="w-fit max-w-[90vw] sm:max-w-[90vw] border-none bg-transparent p-0 shadow-none"
      >
        <DialogTitle className="sr-only">{caption || 'Image'}</DialogTitle>
        <DialogClose asChild>
          <div className="relative max-h-[90vh] flex flex-col items-center cursor-zoom-out">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt={caption || ''}
              className="max-w-full max-h-[80vh] object-contain"
            />
            {caption && <p className="text-white text-sm mt-2">{caption}</p>}
          </div>
        </DialogClose>
      </DialogContent>
    </Dialog>
  )
}

export default ImageBlock
