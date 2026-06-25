import { formatAdminDateTime } from "@/lib/admin/order-utils";
import { cn } from "@/lib/utils";

type AdminDateTimeCellProps = {
  iso: string;
  className?: string;
  size?: "xs" | "sm";
};

export function AdminDateTimeCell({
  iso,
  className,
  size = "xs",
}: AdminDateTimeCellProps) {
  const { date, time } = formatAdminDateTime(iso);

  return (
    <div className={cn("whitespace-nowrap leading-tight", className)}>
      <div
        className={cn(
          "text-gray-600",
          size === "sm" ? "text-sm" : "text-xs",
        )}
      >
        {date}
      </div>
      <div
        className={cn(
          "text-gray-400",
          size === "sm" ? "text-sm" : "text-xs",
        )}
      >
        {time}
      </div>
    </div>
  );
}
