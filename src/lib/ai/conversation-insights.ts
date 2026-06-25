import {
  classifyCustomerMessage,
  formatIssueTypeLabel,
  type IssueClassification,
} from "@/lib/ai/issue-classifier";
import { groqChat } from "@/lib/ai/groq-client";
import { isGroqEnabled } from "@/lib/ai/groq-config";
import { ollamaChat } from "@/lib/ollama";
import {
  alignPriorityWithSuggestedAction,
  isNormalCommerceAction,
  isSupportEscalationMessage,
  resolveConversationPriority,
  resolveSupportSuggestedAction,
  type EscalationHints,
} from "@/lib/support/conversation-priority";
import type { Database, Message } from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ConversationAiInsights = {
  issueType: IssueClassification["issueType"];
  priorityScore: number;
  priorityLevel: IssueClassification["priorityLevel"];
  summary: string;
  customerIntent: string;
  suggestedAction: string;
  suggestedReply: string;
};

function formatTranscript(messages: Message[]): string {
  return messages
    .filter((message) => message.sender_type !== "system")
    .slice(-12)
    .map((message) => {
      const role = message.sender_type === "customer" ? "Customer" : "Admin";
      return `${role}: ${message.content}`;
    })
    .join("\n");
}

function resolveSuggestedAction(input: {
  classification: IssueClassification;
  orderStatus: string | null;
  paymentStatus: string | null;
  hasSupportContext: boolean;
}): string {
  const { classification, orderStatus, paymentStatus, hasSupportContext } = input;

  if (hasSupportContext || classification.issueType === "SUPPORT") {
    return resolveSupportSuggestedAction(classification);
  }

  switch (classification.issueType) {
    case "PAYMENT_ISSUE":
      return paymentStatus === "verification_pending"
        ? "Verify payment"
        : "Request payment screenshot / UTR";
    case "REFUND_REQUEST":
      return "Process refund request";
    case "ORDER_ISSUE":
      if (orderStatus === "shipped") return "Check shipment status";
      return "Offer replacement";
    case "COMPLAINT":
      return "Escalate to manager";
    case "URGENT":
      return "Escalate to manager";
    case "QUESTION":
      return "Request more information";
    default:
      if (orderStatus === "payment_pending" || paymentStatus === "verification_pending") {
        return "Verify payment";
      }
      if (orderStatus === "shipped") return "Check shipment status";
      return "Follow up with customer";
  }
}

function fallbackSummary(messages: Message[]): string {
  const customerMessages = messages.filter((m) => m.sender_type === "customer");
  if (customerMessages.length === 0) {
    return "No customer messages yet.";
  }
  const latest = customerMessages[customerMessages.length - 1]?.content ?? "";
  const preview = latest.length > 120 ? `${latest.slice(0, 120)}…` : latest;
  return `Customer sent ${customerMessages.length} message(s). Latest: "${preview}".`;
}

function fallbackCustomerIntent(
  classification: IssueClassification,
  latestMessage: string,
): string {
  if (classification.issueType === "NORMAL") {
    return latestMessage.length > 80
      ? `${latestMessage.slice(0, 80)}…`
      : latestMessage || "General inquiry";
  }
  return formatIssueTypeLabel(classification.issueType);
}

function fallbackSuggestedReply(
  classification: IssueClassification,
  suggestedAction: string,
): string {
  switch (classification.issueType) {
    case "SUPPORT":
      return "Thanks for reaching out. A support agent will review your request and respond here shortly.";
    case "PAYMENT_ISSUE":
      return "Thanks for reaching out about your payment. Please share your UPI transaction ID or payment screenshot so we can verify it quickly.";
    case "REFUND_REQUEST":
      return "I understand you'd like a refund. I'm reviewing your order details and will update you shortly with next steps.";
    case "ORDER_ISSUE":
      return "Sorry for the trouble with your order. I'm checking the status now and will share an update or replacement option shortly.";
    case "COMPLAINT":
    case "URGENT":
      return "I'm sorry for the inconvenience. I'm prioritizing your case and will get back to you with a resolution as soon as possible.";
    case "QUESTION":
      return "Happy to help! Could you share a bit more detail so I can give you an accurate answer?";
    default:
      return `Thanks for your message. I'll ${suggestedAction.toLowerCase()} and update you shortly.`;
  }
}

async function generateAiInsightsFromLlm(input: {
  transcript: string;
  latestMessage: string;
  classification: IssueClassification;
  suggestedAction: string;
}): Promise<Partial<ConversationAiInsights> | null> {
  const system = `You are an admin assistant for S3K Commerce (WhatsApp grocery orders in India).
Analyze the conversation and return JSON only with these fields:
- summary: 2-3 sentence factual summary
- customerIntent: short phrase describing what the customer wants
- suggestedReply: warm professional reply under 2 sentences for the admin to send

Detected issue type: ${input.classification.issueType}
Recommended action: ${input.suggestedAction}`;

  const user = `Latest customer message: "${input.latestMessage}"

Conversation:
${input.transcript}`;

  try {
    if (isGroqEnabled()) {
      const { content } = await groqChat({
        system,
        user,
        jsonMode: true,
        reason: "Intent detection",
        message: input.latestMessage,
      });
      const parsed = JSON.parse(content) as {
        summary?: string;
        customerIntent?: string;
        suggestedReply?: string;
      };
      return {
        summary: parsed.summary?.trim(),
        customerIntent: parsed.customerIntent?.trim(),
        suggestedReply: parsed.suggestedReply?.trim(),
      };
    }

    const raw = await ollamaChat(system, user, true);
    const parsed = JSON.parse(raw) as {
      summary?: string;
      customerIntent?: string;
      suggestedReply?: string;
    };
    return {
      summary: parsed.summary?.trim(),
      customerIntent: parsed.customerIntent?.trim(),
      suggestedReply: parsed.suggestedReply?.trim(),
    };
  } catch {
    return null;
  }
}

export async function updateConversationAiOps(
  supabase: SupabaseClient<Database>,
  input: {
    conversationId: string;
    customerId: string;
    latestMessage: string;
    escalationHints?: EscalationHints;
  },
): Promise<ConversationAiInsights> {
  const [messagesResult, orderResult, conversationResult] = await Promise.all([
    supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", input.conversationId)
      .order("created_at", { ascending: true })
      .limit(20),
    supabase
      .from("orders")
      .select("status, payment_status")
      .eq("customer_id", input.customerId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("conversations")
      .select(
        "ai_issue_type, ai_priority_score, ai_priority_level, needs_human_assistance, support_ticket_id",
      )
      .eq("id", input.conversationId)
      .maybeSingle(),
  ]);

  if (messagesResult.error) throw messagesResult.error;
  if (orderResult.error) throw orderResult.error;
  if (conversationResult.error) throw conversationResult.error;

  const messages = messagesResult.data ?? [];
  const transcript = formatTranscript(messages);
  const orderStatus = orderResult.data?.status ?? null;
  const paymentStatus = orderResult.data?.payment_status ?? null;
  const conversation = conversationResult.data;

  const hasSupportContext =
    Boolean(conversation?.needs_human_assistance) ||
    Boolean(conversation?.support_ticket_id) ||
    Boolean(input.escalationHints?.supportTicketCreated) ||
    Boolean(input.escalationHints?.supportTicketId) ||
    isSupportEscalationMessage(input.latestMessage);

  const isCommerceAction = isNormalCommerceAction(input.latestMessage);

  let classification = resolveConversationPriority({
    latestMessage: input.latestMessage,
    messages,
    existing: {
      issueType: conversation?.ai_issue_type ?? "NORMAL",
      priorityScore: conversation?.ai_priority_score ?? 10,
      priorityLevel: conversation?.ai_priority_level ?? "normal",
      needsHumanAssistance: conversation?.needs_human_assistance ?? false,
      supportTicketId: conversation?.support_ticket_id ?? null,
    },
    hints: input.escalationHints,
  });

  let suggestedAction = resolveSuggestedAction({
    classification,
    orderStatus,
    paymentStatus,
    hasSupportContext,
  });

  classification = alignPriorityWithSuggestedAction({
    classification,
    suggestedAction,
    hasSupportContext,
    isCommerceAction,
  });

  if (
    hasSupportContext &&
    suggestedAction === "Follow up with customer" &&
    classification.priorityLevel !== "normal"
  ) {
    suggestedAction = resolveSupportSuggestedAction(classification);
  }

  const llmInsights = await generateAiInsightsFromLlm({
    transcript,
    latestMessage: input.latestMessage,
    classification,
    suggestedAction,
  });

  const summary = llmInsights?.summary?.trim() || fallbackSummary(messages);
  const customerIntent =
    llmInsights?.customerIntent?.trim() ||
    fallbackCustomerIntent(classification, input.latestMessage);
  const suggestedReply =
    llmInsights?.suggestedReply?.trim() ||
    fallbackSuggestedReply(classification, suggestedAction);

  const insights: ConversationAiInsights = {
    issueType: classification.issueType,
    priorityScore: classification.priorityScore,
    priorityLevel: classification.priorityLevel,
    summary,
    customerIntent,
    suggestedAction,
    suggestedReply,
  };

  const now = new Date().toISOString();
  const updatePayload: Database["public"]["Tables"]["conversations"]["Update"] = {
    ai_issue_type: insights.issueType,
    ai_priority_score: insights.priorityScore,
    ai_priority_level: insights.priorityLevel,
    ai_summary: insights.summary,
    ai_customer_intent: insights.customerIntent,
    ai_suggested_action: insights.suggestedAction,
    ai_suggested_reply: insights.suggestedReply,
    ai_insights_at: now,
  };

  if (input.escalationHints?.supportTicketId) {
    updatePayload.support_ticket_id = input.escalationHints.supportTicketId;
    updatePayload.support_ticket_created_at = now;
    updatePayload.needs_human_assistance = true;
  }

  const { error: updateError } = await supabase
    .from("conversations")
    .update(updatePayload)
    .eq("id", input.conversationId);

  if (updateError) throw updateError;

  return insights;
}

export async function getConversationAiInsights(
  supabase: SupabaseClient<Database>,
  conversationId: string,
): Promise<ConversationAiInsights | null> {
  const { data, error } = await supabase
    .from("conversations")
    .select(
      "ai_issue_type, ai_priority_score, ai_priority_level, ai_summary, ai_customer_intent, ai_suggested_action, ai_suggested_reply, ai_insights_at",
    )
    .eq("id", conversationId)
    .maybeSingle();

  if (error) throw error;
  if (!data?.ai_insights_at || !data.ai_summary) return null;

  return {
    issueType: data.ai_issue_type,
    priorityScore: data.ai_priority_score,
    priorityLevel: data.ai_priority_level,
    summary: data.ai_summary,
    customerIntent: data.ai_customer_intent ?? "",
    suggestedAction: data.ai_suggested_action ?? "",
    suggestedReply: data.ai_suggested_reply ?? "",
  };
}
