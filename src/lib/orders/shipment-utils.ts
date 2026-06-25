import type { ShipmentStatus } from "@/lib/types";
import { formatShipmentStatusLabel as formatLabel } from "@/lib/orders/order-lifecycle";

/** Generates a tracking reference in the form TRK-XXXXXXXX (8 digits). */
export function generateTrackingReference(): string {
  const digits = Math.floor(10_000_000 + Math.random() * 90_000_000);
  return `TRK-${digits}`;
}

export function formatShipmentStatusLabel(status: ShipmentStatus): string {
  return formatLabel(status);
}
