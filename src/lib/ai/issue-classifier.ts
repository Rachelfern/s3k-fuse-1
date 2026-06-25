import type { AiIssueType, AiPriorityLevel } from "@/lib/types";

export type IssueClassification = {
  issueType: AiIssueType;
  priorityScore: number;
  priorityLevel: AiPriorityLevel;
};

const ISSUE_PRIORITY: Record<AiIssueType, { score: number; level: AiPriorityLevel }> = {
  URGENT: { score: 100, level: "critical" },
  PAYMENT_ISSUE: { score: 95, level: "critical" },
  SUPPORT: { score: 75, level: "high" },
  REFUND_REQUEST: { score: 80, level: "high" },
  COMPLAINT: { score: 75, level: "high" },
  ORDER_ISSUE: { score: 70, level: "high" },
  QUESTION: { score: 30, level: "normal" },
  NORMAL: { score: 10, level: "normal" },
};

function classifyByRules(message: string): AiIssueType {
  const text = message.toLowerCase();

  if (
    /\b(charged|deducted|debited|paid).{0,20}twice\b/.test(text) ||
    /\bdouble (charge|deduction|payment|debit)\b/.test(text) ||
    (/\b(money|payment|paid).{0,30}(deducted|debited)\b/.test(text) &&
      /\b(order.{0,20}(missing|not (?:there|found|created))|no order)\b/.test(text)) ||
    /\b(damaged|broken|spoiled|rotten|wrong item|wrong product|wrong order)\b/.test(text) ||
    /\brefund.{0,30}dispute\b/.test(text) ||
    /\b(manager|supervisor).{0,20}(urgent|immediately|now)\b/.test(text)
  ) {
    return "URGENT";
  }

  if (
    /\b(urgent|emergency|immediately|asap|right now|help me now)\b/.test(text)
  ) {
    return "URGENT";
  }

  if (
    /\b(refund|money back|return my money|chargeback|reverse payment)\b/.test(
      text,
    )
  ) {
    return "REFUND_REQUEST";
  }

  if (
    /\b(payment|paid|upi|transaction|utr|money deducted|payment failed|payment missing|not received payment|payment not|didn't receive confirmation)\b/.test(
      text,
    )
  ) {
    return "PAYMENT_ISSUE";
  }

  if (
    /\b(complaint|worst|terrible|fraud|scam|disgusting|unacceptable|pathetic)\b/.test(
      text,
    )
  ) {
    return "COMPLAINT";
  }

  if (
    /\b(order|delivery|shipment|tracking|missing|wrong item|damaged|late|not delivered|never arrived)\b/.test(
      text,
    )
  ) {
    return "ORDER_ISSUE";
  }

  if (
    /\?/.test(text) ||
    /\b(what|how|when|where|why|can you|could you|is it|do you)\b/.test(text)
  ) {
    return "QUESTION";
  }

  return "NORMAL";
}

export function classifyCustomerMessage(message: string): IssueClassification {
  const issueType = classifyByRules(message);
  const { score, level } = ISSUE_PRIORITY[issueType];

  return {
    issueType,
    priorityScore: score,
    priorityLevel: level,
  };
}

export function mergeIssueClassifications(
  current: IssueClassification,
  incoming: IssueClassification,
): IssueClassification {
  if (incoming.priorityScore > current.priorityScore) {
    return incoming;
  }
  return current;
}

export function priorityBadgeLabel(level: AiPriorityLevel): string {
  switch (level) {
    case "critical":
      return "Urgent";
    case "high":
      return "High";
    default:
      return "Normal";
  }
}

export function formatIssueTypeLabel(issueType: AiIssueType): string {
  return issueType
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}
