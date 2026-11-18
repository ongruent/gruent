import {
  BlockObjectResponse,
  TableBlockObjectResponse,
} from '@notionhq/client/build/src/api-endpoints'
import { Table, TableBody, TableCell, TableRow } from '../core/table'
import RichTextBlock from './RichTextItemBlock'

const TableBlock = ({
  block,
}: {
  block: TableBlockObjectResponse & { children?: BlockObjectResponse[] }
}) => {
  return (
    <Table key={block.id} className="min-w-full border-collapse border border-gray-200">
      <TableBody>
        {block.children?.map((row: any, rowIndex: number) => {
          if (row.type !== 'table_row') return null
          return (
            <TableRow
              key={row.id}
              className={
                rowIndex === 0 && block.table.has_column_header
                  ? 'bg-gray-50 font-semibold'
                  : 'bg-white'
              }
            >
              {row.table_row.cells.map((cell: any, cellIndex: number) => (
                <TableCell
                  key={`${row.id}-${cellIndex}`}
                  className="border border-gray-200 px-4 py-2 whitespace-normal"
                >
                  <RichTextBlock richText={cell} />
                </TableCell>
              ))}
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

export default TableBlock
