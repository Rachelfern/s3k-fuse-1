import {
  fetchConversationMemory,
  findRecentCodCollectionFailedOrderId,
  type ConversationMemory,
} from "@/lib/ai/conversation-context";
import { createSupportTicket } from "@/lib/support/support-ticket-service";
import { isMissingTableError } from "@/lib/supabase/errors";
import type { Database, Message } from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";

export type CodRescheduleResult =
  | {
      handled: true;
      content: string;
      intent: string;
      ticketId: string;
    }
  | { handled: false };

const RESCHEDULE_PATTERNS = [
  /\b(?:i'?m|i am)\s+free\b/i,
  /\b(?:tomorrow|today|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
  /\b(?:deliver|delivery|redeliver|collect).{0,40}(?:tomorrow|then|today|available|free)\b/i,
  /\b(?:available|home|at home).{0,40}(?:tomorrow|today|deliver|delivery)\b/i,
  /\b(?:reschedule|schedule|arrange).{0,30}(?:deliver|delivery|collection|pickup)\b/i,
  /\b(?:can|could)\s+(?:you\s+)?deliver\b/i,
  /\b(?:ok|okay|yes).{0,40}(?:deliver|tomorrow|free|available)\b/i,
];

export function detectDeliveryRescheduleIntent(message: string): boolean {
  const trimmed = message.trim();
  if (!trimmed) return false;
  return RESCHEDULE_PATTERNS.some((pattern) => pattern.test(trimmed));
}

async function upsertCodRescheduleTicket(input: {
  supabase: SupabaseClient<Database>;
  conversationId: string;
  customerId: string;
  orderId: string;
  availabilityNote: string;
}): Promise<string> {
  const { data: existing, error: lookupError } = await input.supabase
    .from("support_tickets")
    .select("id")
    .eq("conversation_id", input.conversationId)
    .eq("order_id", input.orderId)
    .in("status", ["open", "assigned"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lookupError && !isMissingTableError(lookupError, "support_tickets")) {
    throw lookupError;
  }

  const now = new Date().toISOString();
  const subject = `COD redelivery — ${input.availabilityNote}`;

  if (existing?.id) {
    const { error: updateError } = await input.supabase
      .from("support_tickets")
      .update({ subject, updated_at: now })
      .eq("id", existing.id);

    if (updateError) throw updateError;
    return existing.id;
  }

  const ticket = await createSupportTicket({
    supabase: input.supabase,
    conversationId: input.conversationId,
    customerId: input.customerId,
    orderId: input.orderId,
    subject,
  });

  return ticket.id;
}

function buildCodRescheduleAcknowledgement(input: {
  orderId: string;
  totalAmount: number;
  availabilityNote: string;
  ticketId: string;
}): string {
  const amount = Number(input.totalAmount).toLocaleString("en-IN");
  return `Got it — I've noted you're available ${input.availabilityNote} for order ${input.orderId} (₹${amount}).

Our team will schedule COD collection / redelivery and confirm here shortly.

Support ticket: ${input.ticketId}`;
}

export async function tryHandleCodRescheduleReply(input: {
  supabase: SupabaseClient<Database>;
  conversationId: string;
  customerId: string;
  message: string;
  recentMessages?: Pick<Message, "sender_type" | "content" | "intent">[];
  memory?: ConversationMemory;
}): Promise<CodRescheduleResult> {
  if (!detectDeliveryRescheduleIntent(input.message)) {
    return { handled: false };
  }

  const memory =
    input.memory ??
    (await fetchConversationMemory(input.supabase, {
      conversationId: input.conversationId,
      customerId: input.customerId,
    }));

  const orderId =
    memory.pendingContext?.orderId ??
    findRecentCodCollectionFailedOrderId(
      input.recentMessages ?? memory.recentMessages,
    );

  if (!orderId) {
    return { handled: false };
  }

  if (memory.pendingContext?.type !== "cod_collection_failed") {
    const hasCodNotification = memory.recentSystemNotifications.some((notification) =>
      /cod payment not collected/i.test(notification),
    );
    if (!hasCodNotification) {
      return { handled: false };
    }
  }

  const order =
    memory.activeOrder ??
    memory.recentOrders.find((entry) => entry.id === orderId) ??
    null;

  if (!order) {
    return { handled: false };
  }

  const availabilityNote = input.message.trim().slice(0, 120);
  const ticketId = await upsertCodRescheduleTicket({
    supabase: input.supabase,
    conversationId: input.conversationId,
    customerId: input.customerId,
    orderId,
    availabilityNote,
  });

  return {
    handled: true,
    content: buildCodRescheduleAcknowledgement({
      orderId: order.id,
      totalAmount: order.total_amount,
      availabilityNote,
      ticketId,
    }),
    intent: `cod_reschedule_ack|${order.id}|${ticketId}`,
    ticketId,
  };
}
