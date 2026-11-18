import { LightbulbIcon } from 'lucide-react'
import { Alert, AlertDescription } from '../core/alert'
import { Checkbox } from '../core/checkbox'
import { calculateHeadingSlug } from '@gruent/libs/frontend/util/calculateBlogPostSlug'
import { BlockObjectResponse } from '@notionhq/client/build/src/api-endpoints'
import ImageBlock from './ImageBlock'
import RichTextBlock from './RichTextItemBlock'

import NumberListItemBlock from './NumberListItemBlock'
import BulletListItemBlock from './BulletListItemBlock'
import CodeBlock from './CodeBlock'
import './codeBlock.css'
import TableBlock from './TableBlock'

const NotionBlockRenderer = async ({
  blocks,
}: {
  blocks: (BlockObjectResponse & {
    children?: BlockObjectResponse[]
  })[]
}) => {
  return (
    <>
      {blocks.map((block) => {
        switch (block.type) {
          case 'heading_2':
            return (
              <h2
                className="text-gray-800"
                id={calculateHeadingSlug(block.heading_2.rich_text[0].plain_text)}
                key={block.id}
              >
                <RichTextBlock richText={block.heading_2.rich_text} />
              </h2>
            )
          case 'heading_3':
            return (
              <h3
                className="text-gray-800"
                id={calculateHeadingSlug(block.heading_3.rich_text[0].plain_text)}
                key={block.id}
              >
                <RichTextBlock richText={block.heading_3.rich_text} />
              </h3>
            )
          case 'paragraph':
            return (
              <p className="text-gray-800" key={block.id}>
                <RichTextBlock richText={block.paragraph.rich_text} />
              </p>
            )
          case 'image':
            return <ImageBlock key={block.id} block={block} />
          case 'bulleted_list_item':
            return <BulletListItemBlock key={block.id} block={block} />
          case 'numbered_list_item':
            return <NumberListItemBlock key={block.id} block={block} />
          case 'to_do':
            return (
              <div key={block.id} className="flex items-center gap-2">
                <Checkbox checked={block.to_do.checked} disabled aria-readonly />
                <span>
                  <RichTextBlock richText={block.to_do.rich_text} />
                </span>
              </div>
            )
          case 'quote':
            return (
              <blockquote key={block.id}>
                <RichTextBlock richText={block.quote.rich_text} />
              </blockquote>
            )
          case 'code':
            return (
              <pre key={block.id} className="codeBlock">
                <CodeBlock
                  content={block.code.rich_text[0].plain_text}
                  language={block.code.language}
                />
              </pre>
            )
          case 'callout':
            return (
              <Alert variant="warning" key={block.id} className="rounded-none px-6 py-4">
                <LightbulbIcon />
                <AlertDescription className="text-gray-800">
                  <div>
                    <RichTextBlock richText={block.callout.rich_text} />
                  </div>
                </AlertDescription>
              </Alert>
            )
          case 'table':
            return <TableBlock key={block.id} block={block} />
          default:
            return null
        }
      })}
    </>
  )
}

export default NotionBlockRenderer
