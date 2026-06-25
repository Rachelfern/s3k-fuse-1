import {
  classifyCustomerMessage,
  mergeIssueClassifications,
  type IssueClassification,
} from "@/lib/ai/issue-classifier";
import { detectCommerceIntent } from "@/lib/ai/message-intent";
import { isSupportRequest } from "@/lib/ai/message-intent";
import { parseQuickAction } from "@/lib/chat/quick-actions";
import type { AiIssueType, Message } from "@/lib/types";

export type EscalationHints = {
  supportTicketCreated?: boolean;
  supportTicketId?: string;
};

export type ConversationPriorityContext = {
  latestMessage: string;
  messages: Message[];
  existing: {
    issueType: AiIssueType;
    priorityScore: number;
    priorityLevel: IssueClassification["priorityLevel"];
    needsHumanAssistance: boolean;
    supportTicketId: string | null;
  };
  hints?: EscalationHints;
};

export const SUPPORT_HIGH_CLASSIFICATION: IssueClassification = {
  issueType: "SUPPORT",
  priorityScore: 75,
  priorityLevel: "high",
};

export const URGENT_CLASSIFICATION: IssueClassification = {
  issueType: "URGENT",
  priorityScore: 100,
  priorityLevel: "critical",
};

const NORMAL_CLASSIFICATION: IssueClassification = {
  issueType: "NORMAL",
  priorityScore: 10,
  priorityLevel: "normal",
};

const COMMERCE_QUICK_ACTIONS = new Set([
  "browse_products",
  "view_cart",
  "reorder",
  "continue_shopping",
  "best_sellers",
]);

const COMMERCE_INTENTS = new Set([
  "PRODUCT_CATALOG",
  "PRODUCT_SEARCH",
  "RECOMMENDATION",
  "CART_ADD",
  "CART_VIEW",
  "CART_REMOVE",
]);

const COMPLAINT_ISSUE_TYPES = new Set<AiIssueType>([
  "COMPLAINT",
  "URGENT",
  "PAYMENT_ISSUE",
  "REFUND_REQUEST",
  "ORDER_ISSUE",
]);

export function isNormalCommerceAction(message: string): boolean {
  const action = parseQuickAction(message);
  if (action && COMMERCE_QUICK_ACTIONS.has(action.type)) {
    return true;
  }

  const commerceIntent = detectCommerceIntent(message);
  return COMMERCE_INTENTS.has(commerceIntent);
}

export function isSupportEscalationMessage(message: string): boolean {
  const action = parseQuickAction(message);
  if (
    action?.type === "contact_support" ||
    action?.type === "help" ||
    action?.type === "support_ticket"
  ) {
    return true;
  }

  return isSupportRequest(message);
}

export function detectUrgentEscalation(text: string): boolean {
  const lower = text.toLowerCase();

  if (
    /\b(money|payment|amount|paid).{0,40}(deducted|debited|taken)\b/i.test(lower) &&
    /\b(order.{0,20}(missing|not (?:there|found|created|showing))|no order|where.{0,20}order)\b/i.test(
      lower,
    )
  ) {
    return true;
  }

  if (
    /\b(charged|deducted|debited|paid).{0,20}twice\b/i.test(lower) ||
    /\bdouble (charge|deduction|payment|debit)\b/i.test(lower) ||
    /\btwice.{0,20}(charged|deducted|debited)\b/i.test(lower)
  ) {
    return true;
  }

  if (/\b(damaged|broken|spoiled|rotten|torn|leaked|crushed)\b/i.test(lower)) {
    return true;
  }

  if (
    /\bwrong (item|product|order|delivery|package)\b/i.test(lower) ||
    /\b(delivered|received|got).{0,30}\bwrong\b/i.test(lower) ||
    /\bincorrect (item|product|order)\b/i.test(lower)
  ) {
    return true;
  }

  if (
    /\brefund.{0,40}(dispute|not received|still waiting|where|pending too long)\b/i.test(
      lower,
    ) ||
    /\b(dispute|disputing).{0,20}refund\b/i.test(lower)
  ) {
    return true;
  }

  if (
    /\b(manager|supervisor|senior|human|person).{0,30}(urgent|immediately|now|asap)\b/i.test(
      lower,
    ) ||
    /\b(urgent|immediately|asap|right now).{0,30}(manager|supervisor|human|person)\b/i.test(
      lower,
    ) ||
    /\b(speak|talk).{0,20}(manager|supervisor)\b/i.test(lower)
  ) {
    return true;
  }

  return false;
}

export function countUnresolvedComplaints(messages: Message[]): number {
  let lastAdminIndex = -1;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.sender_type === "admin") {
      lastAdminIndex = index;
      break;
    }
  }

  const recentCustomerMessages = messages
    .slice(lastAdminIndex + 1)
    .filter((message) => message.sender_type === "customer");

  let complaintCount = 0;
  for (const message of recentCustomerMessages) {
    const classification = classifyCustomerMessage(message.content);
    if (COMPLAINT_ISSUE_TYPES.has(classification.issueType)) {
      complaintCount += 1;
    }
  }

  if (complaintCount >= 2) {
    return complaintCount;
  }

  const totalComplaints = messages.filter(
    (message) =>
      message.sender_type === "customer" &&
      COMPLAINT_ISSUE_TYPES.has(classifyCustomerMessage(message.content).issueType),
  ).length;

  return totalComplaints >= 2 ? totalComplaints : 0;
}

function transcriptText(messages: Message[]): string {
  return messages
    .filter((message) => message.sender_type === "customer")
    .slice(-8)
    .map((message) => message.content)
    .join("\n");
}

function existingClassification(
  existing: ConversationPriorityContext["existing"],
): IssueClassification {
  return {
    issueType: existing.issueType,
    priorityScore: existing.priorityScore,
    priorityLevel: existing.priorityLevel,
  };
}

export function resolveConversationPriority(
  context: ConversationPriorityContext,
): IssueClassification {
  const { latestMessage, messages, existing, hints } = context;

  if (isNormalCommerceAction(latestMessage)) {
    return NORMAL_CLASSIFICATION;
  }

  let resolved = classifyCustomerMessage(latestMessage);

  const transcript = transcriptText(messages);
  const combinedText = `${transcript}\n${latestMessage}`;

  if (
    detectUrgentEscalation(latestMessage) ||
    detectUrgentEscalation(transcript) ||
    detectUrgentEscalation(combinedText) ||
    countUnresolvedComplaints(messages) >= 2
  ) {
    resolved = mergeIssueClassifications(resolved, URGENT_CLASSIFICATION);
  }

  const hasSupportTicket =
    Boolean(existing.supportTicketId) ||
    Boolean(hints?.supportTicketCreated) ||
    Boolean(hints?.supportTicketId);

  if (
    hasSupportTicket ||
    existing.needsHumanAssistance ||
    isSupportEscalationMessage(latestMessage) ||
    hints?.supportTicketCreated
  ) {
    resolved = mergeIssueClassifications(resolved, SUPPORT_HIGH_CLASSIFICATION);
  }

  resolved = mergeIssueClassifications(resolved, existingClassification(existing));

  return resolved;
}

export function alignPriorityWithSuggestedAction(input: {
  classification: IssueClassification;
  suggestedAction: string;
  hasSupportContext: boolean;
  isCommerceAction?: boolean;
}): IssueClassification {
  const { classification, suggestedAction, hasSupportContext, isCommerceAction } = input;

  if (isCommerceAction) {
    return classification;
  }

  if (
    suggestedAction === "Follow up with customer" &&
    classification.priorityLevel === "normal" &&
    hasSupportContext
  ) {
    return mergeIssueClassifications(classification, SUPPORT_HIGH_CLASSIFICATION);
  }

  if (
    suggestedAction === "Follow up with customer" &&
    classification.priorityLevel === "normal" &&
    classification.issueType !== "QUESTION" &&
    classification.issueType !== "NORMAL"
  ) {
    return mergeIssueClassifications(classification, SUPPORT_HIGH_CLASSIFICATION);
  }

  return classification;
}

export function resolveSupportSuggestedAction(
  classification: IssueClassification,
): string {
  if (classification.issueType === "URGENT") {
    return "Escalate to manager";
  }
  if (classification.issueType === "SUPPORT" || classification.priorityLevel === "high") {
    return "Respond to customer — human assistance requested";
  }
  return "Follow up with customer";
}
