import { formatOrderConfirmationMessage } from "@/lib/chat/conversation-flows";
import { encodeOrderConfirmedIntent } from "@/lib/chat/quick-replies";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Message } from "@/lib/types";

export function buildChatOrderSuccessUrl(
  orderId: string,
  totalAmount: number,
): string {
  const params = new URLSearchParams({
    order: orderId,
    status: "success",
    amount: String(totalAmount),
  });
  return `/chat?${params.toString()}`;
}

export function parseChatOrderSuccessParams(search: string): {
  orderId: string;
  totalAmount: number;
} | null {
  const params = new URLSearchParams(search);
  if (params.get("status") !== "success") return null;

  const orderId = params.get("order")?.trim();
  const amountRaw = params.get("amount");
  const totalAmount = amountRaw ? Number(amountRaw) : NaN;

  if (!orderId || !Number.isFinite(totalAmount) || totalAmount <= 0) {
    return null;
  }

  return { orderId, totalAmount };
}

export async function ensureOrderSuccessChatMessage(
  supabase: SupabaseClient<Database>,
  input: {
    conversationId: string;
    orderId: string;
    totalAmount: number;
  },
): Promise<Message | null> {
  const intent = encodeOrderConfirmedIntent(input.orderId);

  const { data: existing, error: existingError } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", input.conversationId)
    .eq("intent", intent)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing) return existing;

  const { data: inserted, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: input.conversationId,
      sender_type: "system",
      content: formatOrderConfirmationMessage(input.orderId, input.totalAmount),
      intent,
      was_ai_drafted: false,
    })
    .select("*")
    .single();

  if (error) throw error;
  return inserted;
}
