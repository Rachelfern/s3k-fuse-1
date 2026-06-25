import { encodeSupportTicketCreatedIntent } from "@/lib/chat/return-intents";
import { SUPPORT_HIGH_CLASSIFICATION } from "@/lib/support/conversation-priority";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types";

export type SupportTicketRow = {
  id: string;
  conversation_id: string;
  customer_id: string;
  order_id: string | null;
  status: string;
  subject: string | null;
};

export type SupportTicketMessage = {
  content: string;
  intent: string;
};

export async function createSupportTicket(input: {
  supabase: SupabaseClient<Database>;
  conversationId: string;
  customerId: string;
  orderId?: string;
  subject?: string;
}): Promise<SupportTicketRow> {
  const subject =
    input.subject?.trim() ||
    (input.orderId
      ? `Customer support — order ${input.orderId}`
      : "Customer requested human assistance");

  const { data, error } = await input.supabase
    .from("support_tickets")
    .insert({
      conversation_id: input.conversationId,
      customer_id: input.customerId,
      order_id: input.orderId ?? null,
      subject,
      status: "open",
    })
    .select("*")
    .single();

  if (error) throw error;

  const now = new Date().toISOString();
  const { error: conversationError } = await input.supabase
    .from("conversations")
    .update({
      needs_human_assistance: true,
      support_ticket_id: data.id,
      support_ticket_created_at: now,
      ai_issue_type: SUPPORT_HIGH_CLASSIFICATION.issueType,
      ai_priority_score: SUPPORT_HIGH_CLASSIFICATION.priorityScore,
      ai_priority_level: SUPPORT_HIGH_CLASSIFICATION.priorityLevel,
      ai_summary: `Support ticket ${data.id}: ${subject}`,
      ai_suggested_action: "Respond to customer — human assistance requested",
      ai_insights_at: now,
      unread_count: 1,
      last_message_at: now,
    })
    .eq("id", input.conversationId);

  if (conversationError) throw conversationError;

  return data as SupportTicketRow;
}

export function buildSupportTicketConfirmation(ticket: SupportTicketRow): SupportTicketMessage {
  return {
    content: `A support request has been created. An agent will respond shortly.

Ticket ID: ${ticket.id}
Status: Open`,
    intent: encodeSupportTicketCreatedIntent(ticket.id),
  };
}
