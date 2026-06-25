import { isUpiPaymentReviewStatus } from "@/lib/orders/payment-verification-flow";
import type {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  ShipmentStatus,
} from "@/lib/types";

export type OrderTrackingState = {
  status: OrderStatus;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  shipment_status: ShipmentStatus;
  tracking_id: string | null;
};

export const TRACKING_STEPS = [
  {
    title: "Order Placed",
    description: "Order received by seller",
  },
  {
    title: "Payment Verified",
    description: "Payment confirmed by seller",
    codTitle: "Payment on Delivery",
    codDescription: "Pay when your order arrives",
  },
  {
    title: "Packed",
    description: "Items packed at warehouse",
  },
  {
    title: "In Transit",
    description: "Out with delivery partner",
  },
  {
    title: "Delivered",
    description: "Arrived at your address",
  },
] as const;

/** Shipment stages blocked for prepaid orders until payment is verified. */
export const POST_PAYMENT_SHIPMENT_STATUSES: readonly ShipmentStatus[] = [
  "packed",
  "in_transit",
  "delivered",
];

/** Logistics stages managed in the Shipments module. */
export const LOGISTICS_SHIPMENT_STATUSES: readonly ShipmentStatus[] = [
  "packed",
  "in_transit",
  "delivered",
];

/** @deprecated Use LOGISTICS_SHIPMENT_STATUSES — kept for migration compatibility. */
export const FULFILLMENT_SHIPMENT_STAGES: readonly ShipmentStatus[] =
  LOGISTICS_SHIPMENT_STATUSES;

export const ORDER_DETAIL_ALLOWED_UPDATE_FIELDS = [
  "delivery_courier",
  "tracking_id",
  "notes",
  "payment_status",
] as const;

export class OrderStateValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrderStateValidationError";
  }
}

export function resolvePaymentMethod(order: {
  payment_method?: PaymentMethod | null;
  payment_utr?: string | null;
  notes?: string | null;
}): PaymentMethod {
  if (order.payment_method) return order.payment_method;
  if (order.payment_utr?.startsWith("COD-")) return "cod";
  if (order.notes?.toLowerCase().includes("cash on delivery")) return "cod";
  if (order.notes?.toLowerCase().includes("card payment")) return "card";
  return "upi";
}

export function isCodOrder(paymentMethod: PaymentMethod): boolean {
  return paymentMethod === "cod";
}

export function isPrepaidOrder(paymentMethod: PaymentMethod): boolean {
  return paymentMethod === "upi" || paymentMethod === "card";
}

export function isPaymentComplete(paymentStatus: PaymentStatus): boolean {
  return paymentStatus === "verified";
}

export function isUpiAwaitingVerification(
  paymentMethod: PaymentMethod,
  paymentStatus: PaymentStatus,
): boolean {
  return paymentMethod === "upi" && isUpiPaymentReviewStatus(paymentStatus);
}

export function isUpiPaymentRejected(
  paymentMethod: PaymentMethod,
  paymentStatus: PaymentStatus,
): boolean {
  return paymentMethod === "upi" && paymentStatus === "rejected";
}

export function canCustomerRetryUpiPayment(
  paymentMethod: PaymentMethod,
  paymentStatus: PaymentStatus,
  orderStatus: OrderStatus,
): boolean {
  return (
    paymentMethod === "upi" &&
    paymentStatus === "rejected" &&
    orderStatus === "payment_pending"
  );
}

export function canCustomerUploadPaymentScreenshot(
  paymentMethod: PaymentMethod,
  paymentStatus: PaymentStatus,
): boolean {
  if (paymentMethod !== "upi") return false;
  return (
    paymentStatus === "verification_pending" ||
    paymentStatus === "rejected" ||
    paymentStatus === "retry_submitted"
  );
}

export function isPostPaymentShipment(status: ShipmentStatus): boolean {
  return POST_PAYMENT_SHIPMENT_STATUSES.includes(status);
}

export function isShipmentBlockedForOrder(
  paymentMethod: PaymentMethod,
  paymentStatus: PaymentStatus,
): boolean {
  return isPrepaidOrder(paymentMethod) && !isPaymentComplete(paymentStatus);
}

export function isInvalidOrderState(
  paymentMethod: PaymentMethod,
  paymentStatus: PaymentStatus,
  shipmentStatus: ShipmentStatus,
): boolean {
  return (
    isPrepaidOrder(paymentMethod) &&
    !isPaymentComplete(paymentStatus) &&
    isPostPaymentShipment(shipmentStatus)
  );
}

export function isAwaitingCodCollection(
  paymentMethod: PaymentMethod,
  paymentStatus: PaymentStatus,
  shipmentStatus: ShipmentStatus,
): boolean {
  return (
    isCodOrder(paymentMethod) &&
    paymentStatus === "pending" &&
    shipmentStatus === "delivered"
  );
}

export function isCodCollectionFailed(
  paymentMethod: PaymentMethod,
  paymentStatus: PaymentStatus,
): boolean {
  return isCodOrder(paymentMethod) && paymentStatus === "failed";
}

export function isCodDeliveredWithFailedCollection(order: {
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  shipment_status: ShipmentStatus;
}): boolean {
  return (
    isCodCollectionFailed(order.payment_method, order.payment_status) &&
    order.shipment_status === "delivered"
  );
}

export function shipmentRequiresPayment(
  paymentMethod: PaymentMethod,
  shipmentStatus: ShipmentStatus,
): boolean {
  return isPrepaidOrder(paymentMethod) && isPostPaymentShipment(shipmentStatus);
}

function shipmentValidationMessage(shipmentStatus: ShipmentStatus): string {
  switch (shipmentStatus) {
    case "packed":
      return "Cannot mark shipment as packed while payment is pending.";
    case "in_transit":
      return "Cannot mark shipment as in transit while payment is pending.";
    case "delivered":
      return "Cannot mark shipment as delivered while payment is pending.";
    default:
      return "Payment must be completed before shipment processing.";
  }
}

function isLegacyPreFulfillment(status: ShipmentStatus): boolean {
  return status === "awaiting_payment" || status === "assigned";
}

export function normalizeLogisticsShipmentStatus(
  status: ShipmentStatus,
): "packed" | "in_transit" | "delivered" {
  if (isLegacyPreFulfillment(status)) return "packed";
  if (status === "in_transit" || status === "delivered") return status;
  return "packed";
}

function normalizeFulfillmentStage(status: ShipmentStatus): ShipmentStatus {
  return normalizeLogisticsShipmentStatus(status);
}

function fulfillmentStageIndex(status: ShipmentStatus): number {
  const normalized = normalizeFulfillmentStage(status);
  const index = FULFILLMENT_SHIPMENT_STAGES.indexOf(normalized);
  return index === -1 ? 0 : index;
}

/** Current logistics stage plus the single allowed next stage, if any. */
export function getSelectableLogisticsShipmentStatuses(
  currentStatus: ShipmentStatus,
): ShipmentStatus[] {
  const normalized = normalizeLogisticsShipmentStatus(currentStatus);
  const currentIndex = LOGISTICS_SHIPMENT_STATUSES.indexOf(normalized);
  const nextStatus = LOGISTICS_SHIPMENT_STATUSES[currentIndex + 1];
  return nextStatus ? [normalized, nextStatus] : [normalized];
}

export function canAdvanceLogisticsShipmentStatus(
  currentStatus: ShipmentStatus,
): boolean {
  const normalized = normalizeLogisticsShipmentStatus(currentStatus);
  const currentIndex = LOGISTICS_SHIPMENT_STATUSES.indexOf(normalized);
  return currentIndex < LOGISTICS_SHIPMENT_STATUSES.length - 1;
}

export function validateFulfillmentProgression(
  currentShipmentStatus: ShipmentStatus,
  nextShipmentStatus: ShipmentStatus,
): void {
  if (currentShipmentStatus === nextShipmentStatus) return;

  if (
    isLegacyPreFulfillment(currentShipmentStatus) &&
    nextShipmentStatus === "packed"
  ) {
    return;
  }

  const currentIndex = fulfillmentStageIndex(currentShipmentStatus);
  const nextIndex = fulfillmentStageIndex(nextShipmentStatus);

  if (nextIndex !== currentIndex + 1) {
    throw new OrderStateValidationError(
      `Fulfillment must progress sequentially (${LOGISTICS_SHIPMENT_STATUSES.map(formatShipmentStatusLabel).join(" → ")}). Cannot move from ${formatShipmentStatusLabel(normalizeLogisticsShipmentStatus(currentShipmentStatus))} to ${formatShipmentStatusLabel(nextShipmentStatus)}.`,
    );
  }
}

export function validateShipmentStatusChange(
  paymentMethod: PaymentMethod,
  paymentStatus: PaymentStatus,
  currentShipmentStatus: ShipmentStatus,
  nextShipmentStatus: ShipmentStatus,
): void {
  if (
    isPrepaidOrder(paymentMethod) &&
    (paymentStatus === "rejected" || paymentStatus === "failed") &&
    nextShipmentStatus !== currentShipmentStatus
  ) {
    throw new OrderStateValidationError(
      "Cannot update shipment while payment is rejected or failed.",
    );
  }

  if (
    isPrepaidOrder(paymentMethod) &&
    !isPaymentComplete(paymentStatus) &&
    isPostPaymentShipment(nextShipmentStatus)
  ) {
    throw new OrderStateValidationError(
      shipmentValidationMessage(nextShipmentStatus),
    );
  }

  validateFulfillmentProgression(currentShipmentStatus, nextShipmentStatus);
}

export function validateAdminOrderDetailUpdate(
  current: Pick<OrderTrackingState, "payment_method" | "payment_status">,
  fields: {
    status?: OrderStatus;
    shipment_status?: ShipmentStatus;
    payment_status?: PaymentStatus;
    delivery_courier?: string | null;
    tracking_id?: string | null;
    notes?: string | null;
  },
): void {
  for (const key of Object.keys(fields) as (keyof typeof fields)[]) {
    if (fields[key] === undefined) continue;

    if (key === "status") {
      if (
        fields.status === "cancelled" &&
        isCodOrder(current.payment_method) &&
        current.payment_status === "failed"
      ) {
        continue;
      }

      throw new OrderStateValidationError(
        "Order fulfillment status is managed in the Shipments module.",
      );
    }

    if (key === "shipment_status") {
      throw new OrderStateValidationError(
        "Shipment status must be updated from the Shipments module.",
      );
    }

    if (
      key === "payment_status" &&
      !isCodOrder(current.payment_method)
    ) {
      throw new OrderStateValidationError(
        "Prepaid payment status is updated through payment verification.",
      );
    }
  }
}

export function validateOrderFieldsUpdate(
  current: Pick<
    OrderTrackingState,
    "payment_method" | "payment_status" | "shipment_status"
  >,
  fields: {
    payment_method?: PaymentMethod;
    payment_status?: PaymentStatus;
    shipment_status?: ShipmentStatus;
  },
): void {
  const paymentMethod = fields.payment_method ?? current.payment_method;
  const nextPaymentStatus = fields.payment_status ?? current.payment_status;
  const nextShipmentStatus =
    fields.shipment_status ?? current.shipment_status;

  validateShipmentStatusChange(
    paymentMethod,
    nextPaymentStatus,
    current.shipment_status,
    nextShipmentStatus,
  );

  if (
    fields.payment_status &&
    isPrepaidOrder(paymentMethod) &&
    !isPaymentComplete(fields.payment_status) &&
    isPostPaymentShipment(current.shipment_status) &&
    fields.shipment_status === undefined
  ) {
    throw new OrderStateValidationError(
      "Cannot revert payment status while shipment is already in progress.",
    );
  }
}

function getPrepaidTrackingProgress(order: OrderTrackingState): {
  completedThrough: number;
  currentStep: number | null;
} {
  let completedThrough = 1;
  let currentStep: number | null = 2;

  if (order.payment_status === "failed" || order.payment_status === "rejected") {
    return { completedThrough: 1, currentStep: 2 };
  }

  if (!isPaymentComplete(order.payment_status)) {
    return { completedThrough: 1, currentStep: 2 };
  }

  completedThrough = 2;
  currentStep = 3;

  if (order.shipment_status === "packed") {
    completedThrough = 3;
    currentStep = 4;
  } else if (order.shipment_status === "in_transit") {
    completedThrough = 4;
    currentStep = 5;
  } else if (order.shipment_status === "delivered") {
    completedThrough = 5;
    currentStep = null;
  }

  return { completedThrough, currentStep };
}

function getCodTrackingProgress(order: OrderTrackingState): {
  completedThrough: number;
  currentStep: number | null;
} {
  let completedThrough = 1;
  let currentStep: number | null = 3;

  if (order.payment_status === "verified") {
    completedThrough = 2;
  }

  if (
    order.shipment_status === "awaiting_payment" ||
    order.shipment_status === "assigned"
  ) {
    currentStep = 3;
  } else if (order.shipment_status === "packed") {
    completedThrough = Math.max(completedThrough, 3);
    currentStep = 4;
  } else if (order.shipment_status === "in_transit") {
    completedThrough = Math.max(completedThrough, 4);
    currentStep = 5;
  } else if (order.shipment_status === "delivered") {
    if (order.payment_status === "failed") {
      completedThrough = 4;
      currentStep = 2;
    } else if (order.payment_status === "pending") {
      completedThrough = 5;
      currentStep = 2;
    } else {
      completedThrough = 5;
      currentStep = null;
    }
  }

  return { completedThrough, currentStep };
}

export function getTrackingProgress(order: OrderTrackingState): {
  completedThrough: number;
  currentStep: number | null;
} {
  if (isCodOrder(order.payment_method)) {
    return getCodTrackingProgress(order);
  }

  return getPrepaidTrackingProgress(order);
}

export function getTrackingStepTitle(
  stepIndex: number,
  paymentMethod: PaymentMethod,
): string {
  const step = TRACKING_STEPS[stepIndex];
  if (stepIndex === 1 && isCodOrder(paymentMethod) && "codTitle" in step) {
    return step.codTitle;
  }
  return step.title;
}

export function getTrackingStepDescription(
  stepIndex: number,
  paymentMethod: PaymentMethod,
): string {
  const step = TRACKING_STEPS[stepIndex];
  if (
    stepIndex === 1 &&
    isCodOrder(paymentMethod) &&
    "codDescription" in step
  ) {
    return step.codDescription;
  }
  return step.description;
}

export function formatCustomerPaymentStatus(
  paymentMethod: PaymentMethod,
  paymentStatus: PaymentStatus,
): string {
  if (isCodOrder(paymentMethod)) {
    if (paymentStatus === "verified") {
      return "Cash on Delivery — Collected";
    }
    if (paymentStatus === "failed") {
      return "Cash on Delivery — Failed Collection";
    }
    return "Cash on Delivery — Payment Pending";
  }

  if (paymentStatus === "verified") return "Payment Verified";
  if (paymentStatus === "failed") return "Payment Failed";
  if (paymentStatus === "rejected") return "Payment Rejected";
  if (paymentStatus === "retry_submitted") return "Retry Submitted";
  if (paymentStatus === "verification_pending") return "Verification Pending";
  return "Payment Pending";
}

export function formatPaymentMethodLabel(method: PaymentMethod): string {
  switch (method) {
    case "upi":
      return "UPI";
    case "card":
      return "Card";
    case "cod":
      return "COD";
    default:
      return method;
  }
}

export function orderStatusFromShipment(
  shipmentStatus: ShipmentStatus,
): OrderStatus | null {
  switch (shipmentStatus) {
    case "packed":
      return "packed";
    case "in_transit":
      return "shipped";
    case "delivered":
      return "delivered";
    default:
      return null;
  }
}

export function formatShipmentStatusLabel(status: ShipmentStatus): string {
  switch (status) {
    case "awaiting_payment":
      return "Awaiting Payment";
    case "assigned":
      return "Assigned";
    case "packed":
      return "Packed";
    case "in_transit":
      return "In Transit";
    case "delivered":
      return "Delivered";
    default:
      return status;
  }
}

export function formatAdminPaymentStatusLabel(
  paymentMethod: PaymentMethod,
  paymentStatus: PaymentStatus,
): string {
  if (isCodOrder(paymentMethod)) {
    if (paymentStatus === "verified") return "Collected";
    if (paymentStatus === "failed") return "Failed Collection";
    return "Pending";
  }

  if (paymentStatus === "verified") return "Verified";
  if (paymentStatus === "failed") return "Failed";
  if (paymentStatus === "rejected") return "Rejected";
  if (paymentStatus === "retry_submitted") return "Retry Submitted";
  if (paymentStatus === "verification_pending") {
    return "UPI Verification Pending";
  }
  return "Pending";
}
