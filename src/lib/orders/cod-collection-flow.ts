import { createServiceClient } from "@/lib/supabase/service-client";
import { resolveOrderConversationId } from "@/lib/orders/payment-verification-flow";

export const COD_COLLECTION_FAILED_INTENT_PREFIX = "cod_collection_failed|";

export function encodeCodCollectionFailedIntent(orderId: string): string {
  return `${COD_COLLECTION_FAILED_INTENT_PREFIX}${orderId}`;
}

export function parseCodCollectionFailedIntent(
  intent: string | null,
): string | null {
  if (!intent?.startsWith(COD_COLLECTION_FAILED_INTENT_PREFIX)) return null;
  return intent.slice(COD_COLLECTION_FAILED_INTENT_PREFIX.length).trim() || null;
}

export function buildCodCollectionFailedMessage(input: {
  orderId: string;
  totalAmount: number;
}): string {
  const amount = Number(input.totalAmount).toLocaleString("en-IN");
  return `⚠️ COD Payment Not Collected

Order: ${input.orderId}
Amount: ₹${amount}

Your Cash on Delivery payment could not be collected. Please contact support or arrange another payment method.

Status: Action Required`;
}

export async function notifyCustomerOfCodCollectionFailure(input: {
  orderId: string;
  totalAmount: number;
}): Promise<void> {
  const conversationId = await resolveOrderConversationId(input.orderId);
  if (!conversationId) return;

  const supabase = createServiceClient();
  const content = buildCodCollectionFailedMessage(input);
  const intent = encodeCodCollectionFailedIntent(input.orderId);

  const { error } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    sender_type: "system",
    content,
    intent,
    was_ai_drafted: false,
  });

  if (error) {
    console.error(
      "[COD COLLECTION] Failed to notify customer of collection failure:",
      error,
    );
    return;
  }

  await supabase
    .from("conversations")
    .update({
      last_message_at: new Date().toISOString(),
      unread_count: 1,
      ai_priority_level: "high",
    })
    .eq("id", conversationId);
}
