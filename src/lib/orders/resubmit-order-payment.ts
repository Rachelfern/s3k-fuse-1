import {
  deductInventoryForOrder,
  validateOrderInventory,
  type InventoryLineItem,
} from "@/lib/inventory/inventory-service";
import {
  notifyCustomerOfPaymentMethodUpdated,
  notifyCustomerOfPaymentRetrySubmitted,
} from "@/lib/orders/payment-retry-flow";
import { createServiceClient } from "@/lib/supabase/service-client";
import type { OrderStatus, PaymentMethod, PaymentStatus } from "@/lib/types";

export type ResubmitPaymentPayload = {
  method: PaymentMethod;
  transactionReference?: string;
  upiId?: string;
  upiAwaitingVerification?: boolean;
  razorpayPaymentId?: string;
  razorpayOrderId?: string;
  razorpaySignature?: string;
};

export type ResubmitOrderPaymentResult = {
  orderId: string;
  totalAmount: number;
  paymentStatus: PaymentStatus;
  orderStatus: OrderStatus;
  requiresScreenshot: boolean;
};

type CartItemEmbed = {
  product_id: string | null;
  quantity: number;
};

async function fetchOrderCartItems(orderId: string): Promise<InventoryLineItem[]> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("orders")
    .select("carts ( cart_items ( product_id, quantity ) )")
    .eq("id", orderId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("Order not found.");

  const cartItems = (data.carts as { cart_items: CartItemEmbed[] | null } | null)
    ?.cart_items ?? [];

  return cartItems
    .filter((item) => item.product_id)
    .map((item) => ({
      productId: item.product_id!,
      quantity: item.quantity,
    }));
}

function buildPaymentFields(payment: ResubmitPaymentPayload): {
  paymentReference: string | null;
  paymentNotes: string;
  orderStatus: OrderStatus;
  paymentStatus: PaymentStatus;
  requiresScreenshot: boolean;
  shouldDeductInventory: boolean;
} {
  const isCod = payment.method === "cod";
  const isUpiManual =
    payment.method === "upi" && payment.upiAwaitingVerification === true;

  const paymentReference =
    payment.razorpayPaymentId ??
    payment.transactionReference ??
    (isCod ? `COD-${Date.now().toString(36).toUpperCase()}` : null) ??
    (isUpiManual
      ? `UPI-PENDING-${Date.now().toString(36).toUpperCase()}`
      : null);

  if (!paymentReference && !isCod && !isUpiManual) {
    throw new Error("Payment reference is required for online orders.");
  }

  const paymentNotes = isCod
    ? "Cash on Delivery — pay when your order arrives."
    : isUpiManual
      ? "UPI QR payment — awaiting manual verification (retry)."
      : payment.method === "card"
        ? `Card payment via Razorpay (${paymentReference})`
        : payment.upiId
          ? `UPI payment via ${payment.upiId.trim()} (${paymentReference})`
          : `Online payment (${paymentReference})`;

  const orderStatus: OrderStatus =
    isCod || isUpiManual ? "payment_pending" : "confirmed";
  const paymentStatus: PaymentStatus = isCod
    ? "pending"
    : isUpiManual
      ? "verification_pending"
      : "verified";

  return {
    paymentReference,
    paymentNotes,
    orderStatus,
    paymentStatus,
    requiresScreenshot: isUpiManual,
    shouldDeductInventory: isCod || paymentStatus === "verified",
  };
}

export async function resubmitOrderPayment(input: {
  orderId: string;
  customerId: string;
  payment: ResubmitPaymentPayload;
}): Promise<ResubmitOrderPaymentResult> {
  const supabase = createServiceClient();

  const { data: order, error: fetchError } = await supabase
    .from("orders")
    .select("id, customer_id, payment_status, status, total_amount, payment_method")
    .eq("id", input.orderId)
    .maybeSingle();

  if (fetchError) throw fetchError;
  if (!order) throw new Error("Order not found.");
  if (order.customer_id !== input.customerId) {
    throw new Error("Order does not belong to this customer.");
  }
  if (order.payment_status !== "rejected") {
    throw new Error("This order is not eligible for payment retry.");
  }
  if (order.status !== "payment_pending") {
    throw new Error("This order is not eligible for payment retry.");
  }

  const items = await fetchOrderCartItems(input.orderId);
  if (items.length > 0) {
    const inventoryCheck = await validateOrderInventory(supabase, items);
    if (!inventoryCheck.ok) {
      throw new Error(
        "Some items in your order are no longer available. Please contact support.",
      );
    }
  }

  const paymentFields = buildPaymentFields(input.payment);
  const now = new Date().toISOString();

  const { error: updateError } = await supabase
    .from("orders")
    .update({
      payment_method: input.payment.method,
      payment_status: paymentFields.paymentStatus,
      status: paymentFields.orderStatus,
      payment_utr: paymentFields.paymentReference,
      notes: paymentFields.paymentNotes,
      payment_retry_submitted_at: now,
      payment_rejection_reason: null,
      payment_rejected_at: null,
      payment_screenshot_path: null,
      payment_screenshot_url: null,
      payment_screenshot_uploaded_at: null,
    })
    .eq("id", input.orderId);

  if (updateError) throw updateError;

  if (paymentFields.shouldDeductInventory && items.length > 0) {
    const result = await deductInventoryForOrder(supabase, input.orderId, items);
    if (result.status === "failed") {
      console.error("[PAYMENT RETRY] Inventory deduction failed", {
        orderId: input.orderId,
        reason: result.reason,
      });
    }
  }

  const totalAmount = Number(order.total_amount);

  if (input.payment.method === "cod") {
    await notifyCustomerOfPaymentMethodUpdated({
      orderId: input.orderId,
      totalAmount,
      paymentMethod: input.payment.method,
    });
  } else if (
    input.payment.method === "upi" &&
    !paymentFields.requiresScreenshot
  ) {
    await notifyCustomerOfPaymentRetrySubmitted({
      orderId: input.orderId,
      totalAmount,
    });
  } else if (input.payment.method !== "upi") {
    await notifyCustomerOfPaymentMethodUpdated({
      orderId: input.orderId,
      totalAmount,
      paymentMethod: input.payment.method,
    });
  }

  return {
    orderId: input.orderId,
    totalAmount,
    paymentStatus: paymentFields.paymentStatus,
    orderStatus: paymentFields.orderStatus,
    requiresScreenshot: paymentFields.requiresScreenshot,
  };
}

export function defaultRetryPaymentMethod(
  previousMethod: PaymentMethod,
): PaymentMethod {
  if (previousMethod === "upi") return "cod";
  if (previousMethod === "cod") return "upi";
  return "cod";
}
