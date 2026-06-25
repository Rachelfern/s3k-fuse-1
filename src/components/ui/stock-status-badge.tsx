"use client";

import { cn } from "@/lib/utils";
import {
  getStockStatus,
  stockStatusLabel,
  type StockStatus,
} from "@/lib/inventory/stock-status";

const STATUS_STYLES: Record<StockStatus, string> = {
  in_stock: "bg-green-50 text-green-700 ring-green-100",
  low_stock: "bg-amber-50 text-amber-700 ring-amber-100",
  out_of_stock: "bg-red-50 text-red-700 ring-red-100",
};

interface StockStatusBadgeProps {
  stock: number;
  showCount?: boolean;
  className?: string;
}

export function StockStatusBadge({
  stock,
  showCount = false,
  className,
}: StockStatusBadgeProps) {
  const status = getStockStatus(stock);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        STATUS_STYLES[status],
        className,
      )}
    >
      {stockStatusLabel(status)}
      {showCount ? <span className="tabular-nums">· {stock}</span> : null}
    </span>
  );
}
