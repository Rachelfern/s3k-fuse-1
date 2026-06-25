"use client";

import {
  getRealtimeStatusLabel,
  type RealtimeConnectionStatus,
} from "@/hooks/use-realtime-subscription";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<RealtimeConnectionStatus, string> = {
  connected: "border-green-200 bg-green-50 text-green-700",
  connecting: "border-amber-200 bg-amber-50 text-amber-700",
  disconnected: "border-orange-200 bg-orange-50 text-orange-700",
  unavailable: "border-gray-200 bg-gray-50 text-gray-600",
};

const STATUS_DOTS: Record<RealtimeConnectionStatus, string> = {
  connected: "bg-green-500 animate-pulse",
  connecting: "bg-amber-500 animate-pulse",
  disconnected: "bg-orange-500",
  unavailable: "bg-gray-400",
};

interface RealtimeStatusBadgeProps {
  status: RealtimeConnectionStatus;
}

export function RealtimeStatusBadge({ status }: RealtimeStatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium",
        STATUS_STYLES[status],
      )}
    >
      <span className={cn("size-1.5 rounded-full", STATUS_DOTS[status])} />
      {getRealtimeStatusLabel(status)}
    </span>
  );
}
