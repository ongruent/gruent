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
  /** Hide the visible heading when the page header already names the list. */
  hideTitle?: boolean
}

const ListTablePlaceholder = ({
  title,
  description,
  hideTitle,
  children,
}: PropsWithChildren<Props>) => {
  return (
    <>
      {!hideTitle && (
        <>
          <h2 className="text-lg font-extrabold">{title}</h2>
          <p className="mb-4 text-xs text-muted-foreground">{description}</p>
        </>
      )}
      <Empty className="h-72 flex-none rounded-lg border border-dashed bg-muted/30">
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
