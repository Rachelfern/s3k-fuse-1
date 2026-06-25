import { createServiceClient } from "@/lib/supabase/service-client";
import type { PaymentStatus } from "@/lib/types";

export const PAYMENT_REJECTED_INTENT_PREFIX = "payment_rejected|";
export const PAYMENT_VERIFIED_INTENT_PREFIX = "payment_verified|";
export const PAYMENT_SUBMITTED_INTENT_PREFIX = "payment_submitted|";
export const PAYMENT_RETRY_SUBMITTED_INTENT_PREFIX = "payment_retry_submitted|";
export const PAYMENT_METHOD_UPDATED_INTENT_PREFIX = "payment_method_updated|";

export function encodePaymentRejectedIntent(orderId: string): string {
  return `${PAYMENT_REJECTED_INTENT_PREFIX}${orderId}`;
}

export function parsePaymentRejectedIntent(intent: string | null): string | null {
  if (!intent?.startsWith(PAYMENT_REJECTED_INTENT_PREFIX)) return null;
  return intent.slice(PAYMENT_REJECTED_INTENT_PREFIX.length).trim() || null;
}

export function encodePaymentVerifiedIntent(orderId: string): string {
  return `${PAYMENT_VERIFIED_INTENT_PREFIX}${orderId}`;
}

export function parsePaymentVerifiedIntent(intent: string | null): string | null {
  if (!intent?.startsWith(PAYMENT_VERIFIED_INTENT_PREFIX)) return null;
  return intent.slice(PAYMENT_VERIFIED_INTENT_PREFIX.length).trim() || null;
}

export function encodePaymentSubmittedIntent(orderId: string): string {
  return `${PAYMENT_SUBMITTED_INTENT_PREFIX}${orderId}`;
}

export function parsePaymentSubmittedIntent(intent: string | null): string | null {
  if (!intent?.startsWith(PAYMENT_SUBMITTED_INTENT_PREFIX)) return null;
  return intent.slice(PAYMENT_SUBMITTED_INTENT_PREFIX.length).trim() || null;
}

export function encodePaymentRetrySubmittedIntent(orderId: string): string {
  return `${PAYMENT_RETRY_SUBMITTED_INTENT_PREFIX}${orderId}`;
}

export function parsePaymentRetrySubmittedIntent(intent: string | null): string | null {
  if (!intent?.startsWith(PAYMENT_RETRY_SUBMITTED_INTENT_PREFIX)) return null;
  return intent.slice(PAYMENT_RETRY_SUBMITTED_INTENT_PREFIX.length).trim() || null;
}

export function encodePaymentMethodUpdatedIntent(orderId: string): string {
  return `${PAYMENT_METHOD_UPDATED_INTENT_PREFIX}${orderId}`;
}

export function parsePaymentMethodUpdatedIntent(intent: string | null): string | null {
  if (!intent?.startsWith(PAYMENT_METHOD_UPDATED_INTENT_PREFIX)) return null;
  return intent.slice(PAYMENT_METHOD_UPDATED_INTENT_PREFIX.length).trim() || null;
}

export function parsePaymentStatusIntent(intent: string | null): {
  type:
    | "rejected"
    | "verified"
    | "submitted"
    | "retry_submitted"
    | "method_updated";
  orderId: string;
} | null {
  const rejectedOrderId = parsePaymentRejectedIntent(intent);
  if (rejectedOrderId) {
    return { type: "rejected", orderId: rejectedOrderId };
  }

  const verifiedOrderId = parsePaymentVerifiedIntent(intent);
  if (verifiedOrderId) {
    return { type: "verified", orderId: verifiedOrderId };
  }

  const submittedOrderId = parsePaymentSubmittedIntent(intent);
  if (submittedOrderId) {
    return { type: "submitted", orderId: submittedOrderId };
  }

  const retryOrderId = parsePaymentRetrySubmittedIntent(intent);
  if (retryOrderId) {
    return { type: "retry_submitted", orderId: retryOrderId };
  }

  const updatedOrderId = parsePaymentMethodUpdatedIntent(intent);
  if (updatedOrderId) {
    return { type: "method_updated", orderId: updatedOrderId };
  }

  return null;
}

export function isUpiPaymentReviewStatus(status: PaymentStatus): boolean {
  return status === "verification_pending" || status === "retry_submitted";
}

export function buildPaymentRejectionMessage(input: {
  orderId: string;
  totalAmount: number;
  rejectReason: string;
}): string {
  const amount = Number(input.totalAmount).toLocaleString("en-IN");
  return `❌ Payment Not Verified

Order: ${input.orderId}
Amount: ₹${amount}
Method: UPI

Reason: ${input.rejectReason}

Status: Not Verified

Retry payment or upload a new screenshot.`;
}

export function buildPaymentVerifiedMessage(input: {
  orderId: string;
  totalAmount: number;
}): string {
  const amount = Number(input.totalAmount).toLocaleString("en-IN");
  return `✅ Payment Verified

Order: ${input.orderId}
Amount: ₹${amount}
Method: UPI

Status: Verified

We're preparing your order.`;
}

export async function resolveOrderConversationId(
  orderId: string,
): Promise<string | null> {
  const supabase = createServiceClient();

  const { data: order, error } = await supabase
    .from("orders")
    .select("customer_id, carts ( conversation_id )")
    .eq("id", orderId)
    .maybeSingle();

  if (error) throw error;
  if (!order) return null;

  const cartConversation = (
    order.carts as { conversation_id: string | null } | null
  )?.conversation_id;
  if (cartConversation) return cartConversation;

  if (!order.customer_id) return null;

  const { data: conversation, error: conversationError } = await supabase
    .from("conversations")
    .select("id")
    .eq("customer_id", order.customer_id)
    .order("last_message_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (conversationError) throw conversationError;
  return conversation?.id ?? null;
}

export async function notifyCustomerOfPaymentRejection(input: {
  orderId: string;
  totalAmount: number;
  rejectReason: string;
}): Promise<void> {
  const conversationId = await resolveOrderConversationId(input.orderId);
  if (!conversationId) return;

  const supabase = createServiceClient();
  const content = buildPaymentRejectionMessage(input);
  const intent = encodePaymentRejectedIntent(input.orderId);

  const { error } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    sender_type: "system",
    content,
    intent,
    was_ai_drafted: false,
  });

  if (error) {
    console.error("[PAYMENT VERIFY] Failed to notify customer of rejection:", error);
    return;
  }

  await supabase
    .from("conversations")
    .update({
      last_message_at: new Date().toISOString(),
      unread_count: 1,
    })
    .eq("id", conversationId);
}

export async function notifyCustomerOfPaymentVerification(input: {
  orderId: string;
  totalAmount: number;
}): Promise<void> {
  const conversationId = await resolveOrderConversationId(input.orderId);
  if (!conversationId) return;

  const supabase = createServiceClient();
  const content = buildPaymentVerifiedMessage(input);
  const intent = encodePaymentVerifiedIntent(input.orderId);

  const { error } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    sender_type: "system",
    content,
    intent,
    was_ai_drafted: false,
  });

  if (error) {
    console.error("[PAYMENT VERIFY] Failed to notify customer of verification:", error);
    return;
  }

  await supabase
    .from("conversations")
    .update({
      last_message_at: new Date().toISOString(),
      unread_count: 1,
    })
    .eq("id", conversationId);
}
