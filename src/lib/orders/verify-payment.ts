import {
  deductInventoryForOrder,
  type InventoryLineItem,
} from "@/lib/inventory/inventory-service";
import {
  isUpiPaymentReviewStatus,
  notifyCustomerOfPaymentRejection,
  notifyCustomerOfPaymentVerification,
} from "@/lib/orders/payment-verification-flow";
import { createServiceClient } from "@/lib/supabase/service-client";

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

export async function verifyOrderPayment(orderId: string): Promise<void> {
  const supabase = createServiceClient();

  const { data: order, error: fetchError } = await supabase
    .from("orders")
    .select("payment_status, payment_method, status, total_amount")
    .eq("id", orderId)
    .maybeSingle();

  if (fetchError) throw fetchError;
  if (!order) throw new Error("Order not found.");

  if (order.payment_status === "verified") return;

  if (
    order.payment_method === "upi" &&
    !isUpiPaymentReviewStatus(order.payment_status)
  ) {
    throw new Error("Only orders awaiting UPI verification can be approved.");
  }

  const now = new Date().toISOString();

  const { error: updateError } = await supabase
    .from("orders")
    .update({
      payment_status: "verified",
      status: order.status === "payment_pending" ? "confirmed" : order.status,
      payment_verified_at: now,
    })
    .eq("id", orderId);

  if (updateError) throw updateError;

  const items = await fetchOrderCartItems(orderId);
  if (items.length > 0) {
    const result = await deductInventoryForOrder(supabase, orderId, items);
    if (result.status === "failed") {
      console.error("[PAYMENT VERIFY] Inventory deduction failed", {
        orderId,
        reason: result.reason,
      });
    }
  }

  if (order.payment_method === "upi") {
    await notifyCustomerOfPaymentVerification({
      orderId,
      totalAmount: Number(order.total_amount),
    });
  }
}

export async function rejectOrderPayment(
  orderId: string,
  rejectReason: string,
): Promise<void> {
  const reason = rejectReason.trim();
  if (!reason) {
    throw new Error("Rejection reason is required.");
  }

  const supabase = createServiceClient();

  const { data: order, error: fetchError } = await supabase
    .from("orders")
    .select("payment_status, payment_method, status, total_amount")
    .eq("id", orderId)
    .maybeSingle();

  if (fetchError) throw fetchError;
  if (!order) throw new Error("Order not found.");

  if (order.payment_method !== "upi") {
    throw new Error("Only UPI manual payments can be rejected through verification.");
  }

  if (!isUpiPaymentReviewStatus(order.payment_status)) {
    throw new Error("Only orders awaiting UPI verification can be rejected.");
  }

  if (order.payment_status === "rejected") return;

  const now = new Date().toISOString();

  const { error: updateError } = await supabase
    .from("orders")
    .update({
      payment_status: "rejected",
      status: "payment_pending",
      payment_rejection_reason: reason,
      payment_rejected_at: now,
    })
    .eq("id", orderId);

  if (updateError) throw updateError;

  await notifyCustomerOfPaymentRejection({
    orderId,
    totalAmount: Number(order.total_amount),
    rejectReason: reason,
  });
}

export async function markPaymentRetryAwaitingReview(orderId: string): Promise<void> {
  const supabase = createServiceClient();

  const { data: order, error: fetchError } = await supabase
    .from("orders")
    .select("payment_status, payment_method")
    .eq("id", orderId)
    .maybeSingle();

  if (fetchError) throw fetchError;
  if (!order) throw new Error("Order not found.");

  if (order.payment_method !== "upi") return;
  if (order.payment_status !== "retry_submitted") return;

  const { error: updateError } = await supabase
    .from("orders")
    .update({ payment_status: "verification_pending" })
    .eq("id", orderId);

  if (updateError) throw updateError;
}
