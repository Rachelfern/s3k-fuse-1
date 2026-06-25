import {
  encodePaymentMethodUpdatedIntent,
  encodePaymentRetrySubmittedIntent,
  encodePaymentSubmittedIntent,
  resolveOrderConversationId,
} from "@/lib/orders/payment-verification-flow";
import { createServiceClient } from "@/lib/supabase/service-client";
import type { PaymentMethod } from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Message } from "@/lib/types";

export {
  encodePaymentMethodUpdatedIntent,
  encodePaymentRetrySubmittedIntent,
  encodePaymentSubmittedIntent,
  parsePaymentMethodUpdatedIntent,
  parsePaymentRetrySubmittedIntent,
  parsePaymentSubmittedIntent,
} from "@/lib/orders/payment-verification-flow";

function formatInrAmount(totalAmount: number): string {
  return Number(totalAmount).toLocaleString("en-IN");
}

function formatPaymentMethodLabel(method: PaymentMethod): string {
  if (method === "cod") return "Cash on Delivery";
  if (method === "card") return "Card";
  return "UPI";
}

export function buildPaymentSubmittedMessage(input: {
  orderId: string;
  totalAmount: number;
}): string {
  const amount = formatInrAmount(input.totalAmount);
  return `✅ Payment Submitted

Order: ${input.orderId}
Amount: ₹${amount}
Method: UPI

Status: Verification Pending

We'll notify you once verification is complete.`;
}

export function buildPaymentRetrySubmittedMessage(input: {
  orderId: string;
  totalAmount: number;
}): string {
  const amount = formatInrAmount(input.totalAmount);
  return `✅ Payment Retry Submitted

Order: ${input.orderId}
Amount: ₹${amount}
Method: UPI

Status: Verification Pending

We'll notify you once verification is complete.`;
}

export function buildPaymentMethodUpdatedMessage(input: {
  orderId: string;
  totalAmount: number;
  paymentMethod: PaymentMethod;
}): string {
  const amount = formatInrAmount(input.totalAmount);
  return `✅ Payment Method Updated

Order: ${input.orderId}
Amount: ₹${amount}
Method: ${formatPaymentMethodLabel(input.paymentMethod)}

Status: Processing

Your order is being prepared for dispatch.`;
}

export function buildChatPaymentSubmittedSuccessUrl(
  orderId: string,
  totalAmount: number,
): string {
  const params = new URLSearchParams({
    paymentSubmitted: "1",
    order: orderId,
    amount: String(totalAmount),
  });
  return `/chat?${params.toString()}`;
}

export function buildChatPaymentRetrySuccessUrl(
  orderId: string,
  totalAmount: number,
  paymentMethod: PaymentMethod,
): string {
  const params = new URLSearchParams({
    paymentRetry: "1",
    order: orderId,
    amount: String(totalAmount),
    method: paymentMethod,
  });
  return `/chat?${params.toString()}`;
}

export function parseChatPaymentSubmittedParams(search: string): {
  orderId: string;
  totalAmount: number;
} | null {
  const params = new URLSearchParams(search);
  if (params.get("paymentSubmitted") !== "1") return null;

  const orderId = params.get("order")?.trim();
  const amountRaw = params.get("amount");
  const totalAmount = amountRaw ? Number(amountRaw) : NaN;

  if (!orderId || !Number.isFinite(totalAmount) || totalAmount <= 0) {
    return null;
  }

  return { orderId, totalAmount };
}

export function parseChatPaymentRetryParams(search: string): {
  orderId: string;
  totalAmount: number;
  paymentMethod: PaymentMethod;
} | null {
  const params = new URLSearchParams(search);
  if (params.get("paymentRetry") !== "1") return null;

  const orderId = params.get("order")?.trim();
  const amountRaw = params.get("amount");
  const method = params.get("method")?.trim();
  const totalAmount = amountRaw ? Number(amountRaw) : NaN;

  if (
    !orderId ||
    !Number.isFinite(totalAmount) ||
    totalAmount <= 0 ||
    (method !== "upi" && method !== "cod" && method !== "card")
  ) {
    return null;
  }

  return { orderId, totalAmount, paymentMethod: method };
}

async function insertPaymentStatusMessage(input: {
  orderId: string;
  content: string;
  intent: string;
}): Promise<void> {
  const conversationId = await resolveOrderConversationId(input.orderId);
  if (!conversationId) return;

  const supabase = createServiceClient();

  const { error } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    sender_type: "system",
    content: input.content,
    intent: input.intent,
    was_ai_drafted: false,
  });

  if (error) {
    console.error("[PAYMENT STATUS] Failed to insert chat message:", error);
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

export async function notifyCustomerOfPaymentSubmitted(input: {
  orderId: string;
  totalAmount: number;
}): Promise<void> {
  await insertPaymentStatusMessage({
    orderId: input.orderId,
    content: buildPaymentSubmittedMessage(input),
    intent: encodePaymentSubmittedIntent(input.orderId),
  });
}

export async function notifyCustomerOfPaymentRetrySubmitted(input: {
  orderId: string;
  totalAmount: number;
}): Promise<void> {
  await insertPaymentStatusMessage({
    orderId: input.orderId,
    content: buildPaymentRetrySubmittedMessage(input),
    intent: encodePaymentRetrySubmittedIntent(input.orderId),
  });
}

export async function notifyCustomerOfPaymentMethodUpdated(input: {
  orderId: string;
  totalAmount: number;
  paymentMethod: PaymentMethod;
}): Promise<void> {
  await insertPaymentStatusMessage({
    orderId: input.orderId,
    content: buildPaymentMethodUpdatedMessage(input),
    intent: encodePaymentMethodUpdatedIntent(input.orderId),
  });
}

async function ensureRecentPaymentMessage(
  supabase: SupabaseClient<Database>,
  input: {
    conversationId: string;
    intent: string;
    content: string;
  },
): Promise<Message | null> {
  const recentCutoff = new Date(Date.now() - 60_000).toISOString();
  const { data: recent, error: recentError } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", input.conversationId)
    .eq("intent", input.intent)
    .gte("created_at", recentCutoff)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (recentError) throw recentError;
  if (recent) return recent;

  const { data: inserted, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: input.conversationId,
      sender_type: "system",
      content: input.content,
      intent: input.intent,
      was_ai_drafted: false,
    })
    .select("*")
    .single();

  if (error) throw error;
  return inserted;
}

export async function ensurePaymentSubmittedChatMessage(
  supabase: SupabaseClient<Database>,
  input: {
    conversationId: string;
    orderId: string;
    totalAmount: number;
  },
): Promise<Message | null> {
  const intent = encodePaymentSubmittedIntent(input.orderId);
  return ensureRecentPaymentMessage(supabase, {
    conversationId: input.conversationId,
    intent,
    content: buildPaymentSubmittedMessage({
      orderId: input.orderId,
      totalAmount: input.totalAmount,
    }),
  });
}

export async function ensurePaymentRetryChatMessage(
  supabase: SupabaseClient<Database>,
  input: {
    conversationId: string;
    orderId: string;
    totalAmount: number;
    paymentMethod: PaymentMethod;
  },
): Promise<Message | null> {
  const isUpiRetry = input.paymentMethod === "upi";
  const intent = isUpiRetry
    ? encodePaymentRetrySubmittedIntent(input.orderId)
    : encodePaymentMethodUpdatedIntent(input.orderId);

  const content = isUpiRetry
    ? buildPaymentRetrySubmittedMessage({
        orderId: input.orderId,
        totalAmount: input.totalAmount,
      })
    : buildPaymentMethodUpdatedMessage({
        orderId: input.orderId,
        totalAmount: input.totalAmount,
        paymentMethod: input.paymentMethod,
      });

  return ensureRecentPaymentMessage(supabase, {
    conversationId: input.conversationId,
    intent,
    content,
  });
}
