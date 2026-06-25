import type { ShipmentStatus } from "@/lib/types";

const MODERN_SHIPMENT_STATUSES = new Set<ShipmentStatus>([
  "awaiting_payment",
  "assigned",
  "packed",
  "in_transit",
  "delivered",
]);

export function isModernShipmentStatus(
  status: string,
): status is ShipmentStatus {
  return MODERN_SHIPMENT_STATUSES.has(status as ShipmentStatus);
}

/** Map DB / legacy values to the app's shipment status model. */
export function mapShipmentStatusFromDb(status: string): ShipmentStatus {
  switch (status) {
    case "picked_up":
      return "packed";
    case "assigned":
      return "awaiting_payment";
    default:
      return isModernShipmentStatus(status) ? status : "awaiting_payment";
  }
}

/** Map app shipment status to legacy DB values when the state-machine migration is missing. */
export function mapShipmentStatusForLegacyWrite(status: ShipmentStatus): string {
  switch (status) {
    case "awaiting_payment":
      return "assigned";
    case "packed":
      return "picked_up";
    default:
      return status;
  }
}

export function mapShipmentFieldsForLegacyWrite<
  T extends { shipment_status?: ShipmentStatus | string | null },
>(fields: T): T {
  if (!fields.shipment_status) return fields;

  return {
    ...fields,
    shipment_status: mapShipmentStatusForLegacyWrite(
      fields.shipment_status as ShipmentStatus,
    ),
  };
}
