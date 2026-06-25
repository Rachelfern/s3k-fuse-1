import type { ReturnRequest } from "@/lib/types";
import { formatOrderRef } from "@/lib/orders/return-request-flow";
import { formatReturnStatusLabel } from "@/lib/orders/return-status-timeline";

export const TRACKABLE_RETURN_STATUSES = [
  "pending",
  "pending_review",
  "approved",
  "pickup_scheduled",
  "picked_up",
  "refunded",
  "rejected",
  "awaiting_reason",
  "awaiting_photo",
] as const;

export function isTrackableReturnStatus(status: string): boolean {
  return (TRACKABLE_RETURN_STATUSES as readonly string[]).includes(status);
}

export function formatReturnTrackingSummary(request: ReturnRequest): string {
  const orderRef = formatOrderRef(request.order_id);
  const lines = [
    "Return Tracking",
    "",
    `Return Request: ${request.id}`,
    `Order: #${orderRef}`,
    `Status: ${formatReturnStatusLabel(request.status)}`,
  ];

  if (request.pickup_reference) {
    lines.push(`Pickup Reference: ${request.pickup_reference}`);
  }

  if (request.refund_reference) {
    lines.push(`Refund Reference: ${request.refund_reference}`);
  }

  if (request.reason) {
    lines.push(`Reason: ${request.reason}`);
  }

  lines.push("", "Tap Track Return below for the full return timeline.");

  return lines.join("\n");
}
