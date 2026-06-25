import {
  getConversationAiInsights,
  updateConversationAiOps,
  type ConversationAiInsights,
} from "@/lib/ai/conversation-insights";
import { ollamaChat } from "@/lib/ollama";
import type { Database, Message } from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";

export type SuggestedDraft = {
  label: string;
  text: string;
};

export type ConversationSummaryResult = ConversationAiInsights & {
  nextBestAction: string;
  suggestedDrafts: SuggestedDraft[];
};

function formatMessagesForSummary(messages: Message[]): string {
  return messages
    .filter((message) => message.sender_type !== "system")
    .map((message) => {
      const role = message.sender_type === "customer" ? "Customer" : "Business";
      return `${role}: ${message.content}`;
    })
    .join("\n");
}

async function generateSuggestedDrafts(
  transcript: string,
  nextBestAction: string,
  suggestedReply: string,
  latestCustomerMessage: string | null,
): Promise<SuggestedDraft[]> {
  const contextHint = latestCustomerMessage
    ? `Latest customer message: "${latestCustomerMessage}"`
    : "No customer messages yet.";

  try {
    const raw = await ollamaChat(
      `You are a WhatsApp support agent for an Indian grocery store.
Generate exactly 2 short reply drafts as JSON.
Draft 1 label must be "Suggested Reply" with text based on: "${suggestedReply}"
Draft 2 must be context-specific for this next action: "${nextBestAction}" (under 2 sentences).
Return JSON only: {"drafts":[{"label":"Suggested Reply","text":"..."},{"label":"...","text":"..."}]}`,
      `${contextHint}\n\nConversation:\n${transcript}`,
      true,
    );

    const parsed = JSON.parse(raw) as { drafts?: SuggestedDraft[] };
    const drafts = parsed.drafts?.filter(
      (draft) => draft.label?.trim() && draft.text?.trim(),
    );

    if (drafts && drafts.length >= 2) {
      return drafts.slice(0, 2);
    }
  } catch {
    // fall through to defaults
  }

  return [
    {
      label: "Suggested Reply",
      text: suggestedReply,
    },
    {
      label: nextBestAction,
      text: `I'll take care of the next step: ${nextBestAction.toLowerCase()}. I'll update you shortly.`,
    },
  ];
}

export async function summarizeConversation(
  supabase: SupabaseClient<Database>,
  conversationId: string,
  options?: { forceRefresh?: boolean },
): Promise<ConversationSummaryResult> {
  const { data: conversation, error: conversationError } = await supabase
    .from("conversations")
    .select("customer_id, ai_insights_at")
    .eq("id", conversationId)
    .maybeSingle();

  if (conversationError) throw conversationError;

  if (!options?.forceRefresh) {
    const cached = await getConversationAiInsights(supabase, conversationId);
    if (cached) {
      const { data: messages } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .limit(10);

      const chronological = [...(messages ?? [])].reverse();
      const transcript = formatMessagesForSummary(chronological);
      const latestCustomerMessage =
        [...chronological]
          .reverse()
          .find((message) => message.sender_type === "customer")?.content ?? null;

      const suggestedDrafts = await generateSuggestedDrafts(
        transcript,
        cached.suggestedAction,
        cached.suggestedReply,
        latestCustomerMessage,
      );

      return {
        ...cached,
        nextBestAction: cached.suggestedAction,
        suggestedDrafts,
      };
    }
  }

  const { data: latestCustomerMsg } = await supabase
    .from("messages")
    .select("content")
    .eq("conversation_id", conversationId)
    .eq("sender_type", "customer")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const latestMessage =
    latestCustomerMsg?.content ??
    "Customer started a conversation.";

  const insights = await updateConversationAiOps(supabase, {
    conversationId,
    customerId: conversation?.customer_id ?? "",
    latestMessage,
  });

  const { data: messages } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(10);

  const chronological = [...(messages ?? [])].reverse();
  const transcript = formatMessagesForSummary(chronological);
  const suggestedDrafts = await generateSuggestedDrafts(
    transcript,
    insights.suggestedAction,
    insights.suggestedReply,
    latestMessage,
  );

  return {
    ...insights,
    nextBestAction: insights.suggestedAction,
    suggestedDrafts,
  };
}
