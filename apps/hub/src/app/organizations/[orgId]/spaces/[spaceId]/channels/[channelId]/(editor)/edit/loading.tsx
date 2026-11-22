import { Skeleton } from '@gruent/libs/frontend/components/core/skeleton'

/** Mirrors the editor layout: topbar, step library, canvas and inspector. */
export default function Loading() {
  return (
    <>
      <div className="flex h-12 shrink-0 items-center gap-3 px-3">
        <Skeleton className="size-8" />
        <Skeleton className="h-5 w-64" />
        <div className="grow" />
        <Skeleton className="h-6 w-24 rounded-full" />
        <Skeleton className="h-8 w-16" />
      </div>
      <div className="flex min-h-0 grow border-t border-sidebar-border bg-background">
        <div className="flex w-72 flex-col gap-3 border-r p-4">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-8 w-full" />
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
        <div className="grow bg-muted/40" />
        <div className="flex w-[360px] flex-col gap-4 border-l p-5 xl:w-[400px]">
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      </div>
    </>
  )
}
