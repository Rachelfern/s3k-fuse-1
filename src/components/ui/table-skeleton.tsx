import { Skeleton } from "@/components/ui/skeleton";

interface TableSkeletonProps {
  rows?: number;
  columns?: number;
  /** Wrap rows in a full table — use outside an existing `<tbody>`. */
  standalone?: boolean;
}

function TableSkeletonRows({
  rows,
  columns,
}: Required<Pick<TableSkeletonProps, "rows" | "columns">>) {
  return (
    <>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <tr key={rowIndex} className="border-b border-gray-50 last:border-0">
          {Array.from({ length: columns }).map((__, colIndex) => (
            <td key={colIndex} className="px-5 py-4">
              <Skeleton
                className="h-4 bg-gray-200"
                style={{ width: colIndex === 0 ? "80%" : "60%" }}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export function TableSkeleton({
  rows = 5,
  columns = 6,
  standalone = false,
}: TableSkeletonProps) {
  if (standalone) {
    return (
      <table className="w-full text-left text-sm">
        <tbody>
          <TableSkeletonRows rows={rows} columns={columns} />
        </tbody>
      </table>
    );
  }

  return <TableSkeletonRows rows={rows} columns={columns} />;
}
