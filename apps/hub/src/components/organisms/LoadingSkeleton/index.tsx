import { Skeleton } from '@gruent/libs/frontend/components/core/skeleton'

const LoadingSkeleton = () => {
  return (
    <div className="w-full max-w-lg flex flex-col gap-1">
      <Skeleton className="w-3/4 h-4 rounded-sm animate-shimmer" />
      <Skeleton className="w-full h-4 rounded-sm animate-shimmer" />
      <Skeleton className="w-full h-4 rounded-sm animate-shimmer" />
      <Skeleton className="w-full h-4 rounded-sm animate-shimmer" />
    </div>
  )
}

export default LoadingSkeleton
