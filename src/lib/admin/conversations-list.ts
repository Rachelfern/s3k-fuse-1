import { createServiceClient } from "@/lib/supabase/service-client";
import { isMissingColumnError } from "@/lib/supabase/errors";
import type { AiIssueType, AiPriorityLevel } from "@/lib/types";

export interface ConversationListItem {
  id: string;
  customer_id: string;
  unread_count: number;
  last_message_at: string;
  customer_name: string | null;
  customer_phone: string;
  dpdp_consent: boolean;
  deletion_status: string | null;
  last_message_preview: string | null;
  ai_issue_type: AiIssueType;
  ai_priority_score: number;
  ai_priority_level: AiPriorityLevel;
  ai_summary: string | null;
}

type ConversationRow = {
  id: string;
  customer_id: string | null;
  unread_count: number;
  last_message_at: string;
  ai_issue_type?: AiIssueType;
  ai_priority_score?: number;
  ai_priority_level?: AiPriorityLevel;
  ai_summary?: string | null;
  customers: {
    name: string | null;
    phone: string;
    dpdp_consent: boolean;
    deletion_status: string | null;
  } | null;
};

export async function fetchAdminConversations(): Promise<ConversationListItem[]> {
  const supabase = createServiceClient();

  let includeAiFields = true;
  let conversations: ConversationRow[] | null = null;
  let fetchError: Error | null = null;

  const fullQuery = await supabase
    .from("conversations")
    .select(
      "id, customer_id, unread_count, last_message_at, ai_issue_type, ai_priority_score, ai_priority_level, ai_summary, customers ( name, phone, dpdp_consent, deletion_status )",
    )
    .order("ai_priority_score", { ascending: false })
    .order("last_message_at", { ascending: false });

  if (
    fullQuery.error &&
    (isMissingColumnError(fullQuery.error, "ai_issue_type") ||
      isMissingColumnError(fullQuery.error, "ai_priority_score") ||
      isMissingColumnError(fullQuery.error, "ai_priority_level") ||
      isMissingColumnError(fullQuery.error, "ai_summary"))
  ) {
    if (process.env.NODE_ENV === "development") {
      console.warn(
        "[ADMIN CHATS FETCH] AI columns missing — using legacy fallback. Run supabase/migrations/20250623140000_ai_ops_payment_screenshots.sql",
      );
    }
    includeAiFields = false;
    const legacyQuery = await supabase
      .from("conversations")
      .select(
        "id, customer_id, unread_count, last_message_at, customers ( name, phone, dpdp_consent, deletion_status )",
      )
      .order("last_message_at", { ascending: false });

    conversations = (legacyQuery.data ?? []) as ConversationRow[];
    fetchError = legacyQuery.error;
  } else {
    conversations = (fullQuery.data ?? []) as ConversationRow[];
    fetchError = fullQuery.error;
  }

  if (fetchError) throw fetchError;

  const rows = conversations;
  if (rows.length === 0) {
    if (process.env.NODE_ENV === "development") {
      console.log("[ADMIN CHATS FETCH]", { rowsReturned: 0, error: null });
    }
    return [];
  }

  const conversationIds = rows.map((row) => row.id);
  const { data: messageRows, error: messagesError } = await supabase
    .from("messages")
    .select("conversation_id, content, created_at")
    .in("conversation_id", conversationIds)
    .order("created_at", { ascending: false });

  if (messagesError) throw messagesError;

  const previewByConversation = new Map<string, string>();
  for (const message of messageRows ?? []) {
    if (
      !message.conversation_id ||
      previewByConversation.has(message.conversation_id)
    ) {
      continue;
    }
    previewByConversation.set(message.conversation_id, message.content);
  }

  const items = rows.map((row) => ({
    id: row.id,
    customer_id: row.customer_id ?? "",
    unread_count: row.unread_count,
    last_message_at: row.last_message_at,
    customer_name: row.customers?.name ?? null,
    customer_phone: row.customers?.phone ?? "",
    dpdp_consent: row.customers?.dpdp_consent ?? false,
    deletion_status: row.customers?.deletion_status ?? null,
    last_message_preview: previewByConversation.get(row.id) ?? null,
    ai_issue_type: (includeAiFields ? row.ai_issue_type : undefined) ?? "NORMAL",
    ai_priority_score:
      (includeAiFields ? row.ai_priority_score : undefined) ?? 10,
    ai_priority_level:
      (includeAiFields ? row.ai_priority_level : undefined) ?? "normal",
    ai_summary: (includeAiFields ? row.ai_summary : undefined) ?? null,
  }));

  if (process.env.NODE_ENV === "development") {
    console.log("[ADMIN CHATS FETCH]", {
      rowsReturned: items.length,
      error: null,
    });
  }

  return items;
}
