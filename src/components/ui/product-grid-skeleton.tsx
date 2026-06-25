import { Skeleton } from "@/components/ui/skeleton";

interface ProductGridSkeletonProps {
  count?: number;
}

export function ProductGridSkeleton({ count = 5 }: ProductGridSkeletonProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="overflow-hidden rounded-xl border border-gray-100 bg-white p-4 shadow-sm"
        >
          <Skeleton className="mb-3 h-32 w-full rounded-lg bg-gray-200" />
          <Skeleton className="mb-2 h-4 w-3/4 bg-gray-200" />
          <Skeleton className="mb-3 h-3 w-1/2 bg-gray-200" />
          <div className="flex items-center justify-between">
            <Skeleton className="h-5 w-16 bg-gray-200" />
            <Skeleton className="h-8 w-20 rounded-full bg-gray-200" />
          </div>
        </div>
      ))}
    </div>
  );
}
