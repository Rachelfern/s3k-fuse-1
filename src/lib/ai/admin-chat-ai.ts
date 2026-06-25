import type { Message, OrderStatus } from "@/lib/types";
import { generateOllamaJson, generateOllamaText } from "@/lib/ai/ollama-client";

export type DraftSuggestion = {
  label: string;
  text: string;
};

export type NextBestActionKey =
  | "monitor_shipment"
  | "confirm_payment"
  | "send_confirmation"
  | "follow_up_cart";

export function formatMessagesForPrompt(messages: Message[]): string {
  return messages
    .filter((message) => message.sender_type !== "system")
    .map((message) => {
      const role =
        message.sender_type === "customer" ? "Customer" : "Admin";
      return `${role}: ${message.content}`;
    })
    .join("\n");
}

export function fallbackSummary(messages: Message[]): string {
  const customerMessages = messages.filter(
    (message) => message.sender_type === "customer",
  );
  const adminMessages = messages.filter(
    (message) => message.sender_type === "admin",
  );

  if (customerMessages.length === 0) {
    return "No customer messages yet. Waiting for the customer to start the conversation.";
  }

  const latestCustomer =
    customerMessages[customerMessages.length - 1]?.content ?? "";
  const preview =
    latestCustomer.length > 80
      ? `${latestCustomer.slice(0, 80)}…`
      : latestCustomer;

  return `Customer has sent ${customerMessages.length} message${customerMessages.length === 1 ? "" : "s"}. Latest: "${preview}". ${adminMessages.length > 0 ? "Admin has responded." : "Awaiting admin reply."}`;
}

export function fallbackDraft(messages: Message[]): string {
  const latestCustomer = [...messages]
    .reverse()
    .find((message) => message.sender_type === "customer");

  if (!latestCustomer) {
    return "Namaste! Thank you for reaching out to S3K Commerce. How can I help you today?";
  }

  const text = latestCustomer.content.toLowerCase();

  if (text.includes("track") || text.includes("order")) {
    return "I'll check your order status right away and share tracking details shortly. Could you confirm your order ID if you have it handy?";
  }

  if (text.includes("payment") || text.includes("pay") || text.includes("upi")) {
    return "For payment verification, please share your UPI transaction reference after paying. Our team confirms payments within a few minutes during business hours.";
  }

  return "Thanks for your message! I'm here to help with orders, delivery updates, or payment questions. What would you like to know?";
}

export function fallbackDraftSuggestions(messages: Message[]): DraftSuggestion[] {
  const base = fallbackDraft(messages);

  return [
    { label: "General Support", text: base },
    {
      label: "Order Confirmation",
      text: "Your order has been received and is being prepared. I'll share confirmation and estimated delivery time shortly. Thank you for ordering from S3K Commerce!",
    },
  ];
}

export async function generateConversationSummary(
  messages: Message[],
): Promise<string> {
  if (messages.length === 0) {
    return "No messages in this conversation yet.";
  }

  const transcript = formatMessagesForPrompt(messages);

  try {
    const summary = await generateOllamaText(
      `You are an admin assistant for S3K Commerce, a WhatsApp commerce platform for Indian businesses.
Summarize this customer support conversation in at most 3 short sentences. Be factual and concise.

Conversation:
${transcript}

Return only the summary paragraph.`,
    );

    return summary.replace(/^["']|["']$/g, "").trim();
  } catch {
    return fallbackSummary(messages);
  }
}

export async function generateAdminDraft(messages: Message[]): Promise<string> {
  if (messages.length === 0) {
    return fallbackDraft(messages);
  }

  const transcript = formatMessagesForPrompt(messages);

  try {
    const draft = await generateOllamaText(
      `You are a friendly customer support agent for S3K Commerce, an Indian food delivery business.
Draft a reply to the customer based on the conversation. Be warm, professional, use simple English. Keep under 100 words.

Conversation:
${transcript}

Return only the reply text.`,
    );

    return draft.replace(/^["']|["']$/g, "").trim();
  } catch {
    return fallbackDraft(messages);
  }
}

export async function generateDraftSuggestions(
  messages: Message[],
): Promise<DraftSuggestion[]> {
  if (messages.length === 0) {
    return fallbackDraftSuggestions(messages);
  }

  const transcript = formatMessagesForPrompt(messages);

  try {
    const raw = await generateOllamaJson(
      `You are a customer support agent for S3K Commerce.
Generate 2 different reply drafts for this conversation.
Return JSON only: {"drafts":[{"label":"General Support","text":"..."},{"label":"Delivery Updates","text":"..."}]}

Conversation:
${transcript}`,
    );

    const parsed = JSON.parse(raw) as { drafts?: DraftSuggestion[] };
    const drafts = parsed.drafts?.filter(
      (draft) => draft.label?.trim() && draft.text?.trim(),
    );

    if (drafts && drafts.length >= 2) {
      return drafts.slice(0, 2);
    }
  } catch {
    // fall through to fallback
  }

  return fallbackDraftSuggestions(messages);
}

export function resolveNextBestAction(input: {
  orderStatus: OrderStatus | null;
  paymentPending: boolean;
  hasAbandonedCart: boolean;
}): NextBestActionKey {
  if (input.orderStatus === "shipped") return "monitor_shipment";
  if (input.orderStatus === "payment_pending" || input.paymentPending) {
    return "confirm_payment";
  }
  if (input.orderStatus === "new") return "send_confirmation";
  if (input.hasAbandonedCart) return "follow_up_cart";
  return "follow_up_cart";
}

export const NEXT_BEST_ACTION_LABELS: Record<
  NextBestActionKey,
  { label: string; icon: "truck" | "credit-card" | "check-circle" | "shopping-cart" }
> = {
  monitor_shipment: { label: "Monitor Shipment Status", icon: "truck" },
  confirm_payment: { label: "Confirm Payment", icon: "credit-card" },
  send_confirmation: { label: "Send Order Confirmation", icon: "check-circle" },
  follow_up_cart: { label: "Follow up on Cart", icon: "shopping-cart" },
};
