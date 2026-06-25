import type {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  ShipmentStatus,
} from "@/lib/types";
import {
  formatAdminPaymentStatusLabel,
  formatPaymentMethodLabel,
  formatShipmentStatusLabel,
  isAwaitingCodCollection,
  isCodCollectionFailed,
  isCodDeliveredWithFailedCollection,
  isInvalidOrderState,
  isShipmentBlockedForOrder,
} from "@/lib/orders/order-lifecycle";

export const ORDER_FILTER_TABS = [
  { label: "All", value: "all" },
  { label: "New", value: "new" },
  { label: "Payment Pending", value: "payment_pending" },
  { label: "Confirmed", value: "confirmed" },
  { label: "Packed", value: "packed" },
  { label: "Shipped", value: "shipped" },
  { label: "Delivered", value: "delivered" },
  { label: "Cancelled", value: "cancelled" },
] as const;

export type OrderFilterValue = (typeof ORDER_FILTER_TABS)[number]["value"];

export const ORDER_STATUSES: OrderStatus[] = [
  "new",
  "payment_pending",
  "confirmed",
  "packed",
  "shipped",
  "delivered",
  "cancelled",
];

export const COURIER_OPTIONS = [
  "Swiggy Genie",
  "Porter",
  "Dunzo",
  "Shiprocket",
  "Self Delivery",
] as const;

export const LOGISTICS_SHIPMENT_STATUS_OPTIONS: {
  value: ShipmentStatus;
  label: string;
}[] = [
  { value: "packed", label: "Packed" },
  { value: "in_transit", label: "In Transit" },
  { value: "delivered", label: "Delivered" },
];

/** @deprecated Use LOGISTICS_SHIPMENT_STATUS_OPTIONS for the Shipments module. */
export const SHIPMENT_STATUS_OPTIONS: {
  value: ShipmentStatus;
  label: string;
}[] = LOGISTICS_SHIPMENT_STATUS_OPTIONS;

export const SHIPMENT_STATUS_BLOCKED_TOOLTIP =
  "Payment must be completed before shipment processing.";

export const ORDER_STATUS_CHIP_STYLES: Record<OrderStatus, string> = {
  new: "bg-blue-100 text-blue-700",
  payment_pending: "bg-red-100 text-red-700 font-semibold",
  confirmed: "bg-green-100 text-green-700",
  packed: "bg-purple-100 text-purple-700",
  shipped: "bg-blue-100 text-blue-700",
  delivered: "bg-green-500 text-white",
  cancelled: "bg-red-500 text-white",
};

export const SHIPMENT_STATUS_SELECT_STYLES: Record<ShipmentStatus, string> = {
  awaiting_payment: "border-amber-200 bg-amber-50 text-amber-700",
  assigned: "border-gray-200 bg-gray-50 text-gray-700",
  packed: "border-purple-200 bg-purple-50 text-purple-700",
  in_transit: "border-blue-200 bg-blue-50 text-blue-700",
  delivered: "border-green-200 bg-green-50 text-green-700",
};

export const PAYMENT_STATUS_CHIP_STYLES: Record<PaymentStatus, string> = {
  pending: "bg-amber-100 text-amber-700",
  verification_pending: "bg-blue-100 text-blue-700",
  retry_submitted: "bg-indigo-100 text-indigo-700",
  rejected: "bg-red-100 text-red-700",
  verified: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
};

export function formatINR(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function isDeletedCustomerPhone(
  phone: string | null | undefined,
): boolean {
  return phone?.startsWith("deleted_") ?? false;
}

export function formatAdminCustomerLabel(
  name: string | null | undefined,
  phone: string | null | undefined,
): string {
  if (isDeletedCustomerPhone(phone)) {
    return "Deleted Customer";
  }
  return name?.trim() || phone?.trim() || "Unknown customer";
}

export function getAdminCustomerTooltip(
  name: string | null | undefined,
  phone: string | null | undefined,
): string | undefined {
  if (isDeletedCustomerPhone(phone)) {
    return phone ?? undefined;
  }
  if (name?.trim() && phone?.trim() && name.trim() !== phone.trim()) {
    return `${name.trim()} · ${phone.trim()}`;
  }
  return undefined;
}

const ADMIN_DATE_TIMEZONE = "Asia/Kolkata";

export function formatAdminDateTime(iso: string): { date: string; time: string } {
  const date = new Date(iso);
  const time = new Intl.DateTimeFormat("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: ADMIN_DATE_TIMEZONE,
  })
    .format(date)
    .replace(/\s(am|pm)$/i, (_, meridiem: string) => ` ${meridiem.toUpperCase()}`);

  return {
    date: new Intl.DateTimeFormat("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: ADMIN_DATE_TIMEZONE,
    }).format(date),
    time,
  };
}

export function formatOrderDateTime(iso: string): string {
  const { date, time } = formatAdminDateTime(iso);
  return `${date} ${time}`;
}

export function formatStatusLabel(status: OrderStatus): string {
  return status.replace(/_/g, " ");
}

export function formatPaymentStatusLabel(
  paymentMethod: PaymentMethod,
  status: PaymentStatus,
): string {
  return formatAdminPaymentStatusLabel(paymentMethod, status);
}

export {
  formatPaymentMethodLabel,
  formatShipmentStatusLabel,
  isAwaitingCodCollection,
  isCodCollectionFailed,
  isCodDeliveredWithFailedCollection,
  isInvalidOrderState,
  isShipmentBlockedForOrder,
};
