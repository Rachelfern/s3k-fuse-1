import { TableSkeleton } from "@/components/ui/table-skeleton";

export default function AdminReturnsLoading() {
  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="space-y-2">
        <div className="h-8 w-56 animate-pulse rounded bg-gray-200" />
        <div className="h-4 w-80 max-w-full animate-pulse rounded bg-gray-100" />
      </div>
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 5 }).map((_, index) => (
          <div
            key={index}
            className="h-8 w-24 animate-pulse rounded-full bg-gray-100"
          />
        ))}
      </div>
      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <TableSkeleton rows={5} columns={8} standalone />
      </section>
    </div>
  );
}
