import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@gruent/libs/frontend/components/core/empty'
import { PropsWithChildren } from 'react'

type Props = {
  title: string
  description: string
}

const ListTablePlaceholder = ({ title, description, children }: PropsWithChildren<Props>) => {
  return (
    <>
      <h2 className="text-lg font-extrabold">{title}</h2>
      <p className="text-gray-500 text-xs mb-4">{description}</p>
      <Empty className="h-72 flex-none bg-gray-100 dark:bg-gray-800 border border-solid border-gray-200 dark:border-gray-700 rounded-md">
        <EmptyHeader className="sr-only">
          <EmptyTitle>{title}</EmptyTitle>
          <EmptyDescription>{description}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>{children}</EmptyContent>
      </Empty>
    </>
  )
}

export default ListTablePlaceholder
