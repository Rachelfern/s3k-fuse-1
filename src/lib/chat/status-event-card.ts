import { parseOrderConfirmedIntent } from "@/lib/chat/quick-replies";
import {
  RETURN_CONFIRMED_INTENT_PREFIX,
  RETURN_TRACKING_INTENT_PREFIX,
} from "@/lib/chat/return-intents";
import { parseCodCollectionFailedIntent } from "@/lib/orders/cod-collection-flow";
import {
  parsePaymentMethodUpdatedIntent,
  parsePaymentRejectedIntent,
  parsePaymentRetrySubmittedIntent,
  parsePaymentSubmittedIntent,
  parsePaymentVerifiedIntent,
} from "@/lib/orders/payment-verification-flow";
import {
  parseReturnStatusIntent,
  type ReturnWorkflowStatus,
} from "@/lib/orders/return-status-timeline";

export const CHAT_STATUS_EVENT_SHELL =
  "w-full max-w-full min-w-0 rounded-lg border px-2.5 py-1 text-center text-[11px] leading-snug text-gray-600 shadow-sm";

export type ChatStatusEventVariant =
  | "order_received_pending"
  | "payment_rejected"
  | "payment_submitted"
  | "payment_retry_submitted"
  | "payment_verified"
  | "payment_method_updated"
  | "order_confirmed"
  | "return_submitted"
  | "return_approved"
  | "pickup_scheduled"
  | "refund_processed"
  | "return_rejected"
  | "order_cancelled"
  | "order_delivered"
  | "cod_collection_failed"
  | "generic";

export type ChatStatusEventTheme = {
  icon: string;
  title: string;
  shell: string;
  statusTextClass: string;
};

export const CHAT_STATUS_EVENT_THEMES: Record<
  ChatStatusEventVariant,
  ChatStatusEventTheme
> = {
  order_received_pending: {
    icon: "📋",
    title: "Order Received — UPI Verification Pending",
    shell: "border-amber-200/70 bg-[#fff9c4]/90",
    statusTextClass: "text-amber-800",
  },
  payment_rejected: {
    icon: "❌",
    title: "Payment Not Verified",
    shell: "border-red-200/80 bg-red-50/95",
    statusTextClass: "text-red-800",
  },
  payment_submitted: {
    icon: "💳",
    title: "Payment Submitted",
    shell: "border-blue-200/80 bg-blue-50/95",
    statusTextClass: "text-blue-800",
  },
  payment_retry_submitted: {
    icon: "💳",
    title: "Payment Retry Submitted",
    shell: "border-blue-200/80 bg-blue-50/95",
    statusTextClass: "text-blue-800",
  },
  payment_verified: {
    icon: "✅",
    title: "Payment Verified",
    shell: "border-green-200/80 bg-green-50/95",
    statusTextClass: "text-green-800",
  },
  payment_method_updated: {
    icon: "✅",
    title: "Payment Method Updated",
    shell: "border-green-200/80 bg-green-50/95",
    statusTextClass: "text-green-800",
  },
  order_confirmed: {
    icon: "✅",
    title: "Order Confirmed",
    shell: "border-green-200/80 bg-green-50/95",
    statusTextClass: "text-green-800",
  },
  return_submitted: {
    icon: "📦",
    title: "Return Submitted",
    shell: "border-orange-200/80 bg-orange-50/95",
    statusTextClass: "text-orange-800",
  },
  return_approved: {
    icon: "✅",
    title: "Return Approved",
    shell: "border-green-200/80 bg-green-50/95",
    statusTextClass: "text-green-800",
  },
  pickup_scheduled: {
    icon: "🚚",
    title: "Pickup Scheduled",
    shell: "border-orange-200/80 bg-orange-50/95",
    statusTextClass: "text-orange-800",
  },
  refund_processed: {
    icon: "✅",
    title: "Refund Processed",
    shell: "border-green-200/80 bg-green-50/95",
    statusTextClass: "text-green-800",
  },
  return_rejected: {
    icon: "❌",
    title: "Return Rejected",
    shell: "border-red-200/80 bg-red-50/95",
    statusTextClass: "text-red-800",
  },
  order_cancelled: {
    icon: "🚫",
    title: "Order Cancelled",
    shell: "border-red-200/80 bg-red-50/95",
    statusTextClass: "text-red-800",
  },
  order_delivered: {
    icon: "📬",
    title: "Order Delivered",
    shell: "border-green-200/80 bg-green-50/95",
    statusTextClass: "text-green-800",
  },
  cod_collection_failed: {
    icon: "⚠️",
    title: "COD Payment Not Collected",
    shell: "border-amber-300/80 bg-amber-50/95",
    statusTextClass: "text-amber-900",
  },
  generic: {
    icon: "📋",
    title: "Update",
    shell: "border-amber-200/70 bg-[#fff9c4]/90",
    statusTextClass: "text-amber-800",
  },
};

const RETURN_STATUS_VARIANTS: Partial<
  Record<ReturnWorkflowStatus | "submitted", ChatStatusEventVariant>
> = {
  awaiting_reason: "return_submitted",
  awaiting_photo: "return_submitted",
  pending: "return_submitted",
  approved: "return_approved",
  pickup_scheduled: "pickup_scheduled",
  picked_up: "pickup_scheduled",
  refunded: "refund_processed",
  rejected: "return_rejected",
};

export type ParsedChatStatusEvent = {
  variant: ChatStatusEventVariant;
  titleLine: string;
  detailBlock: string;
  statusLine: string | null;
  timestamp: string;
};

export function formatChatStatusEventTimestamp(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(iso));
}

function parseLineValue(content: string, label: string): string | null {
  const pattern = new RegExp(`^${label}:\\s*(.+)$`, "im");
  const match = content.match(pattern);
  return match?.[1]?.trim() ?? null;
}

function contentLines(content: string): string[] {
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function mapReturnStatusToVariant(status: string): ChatStatusEventVariant {
  return RETURN_STATUS_VARIANTS[status as ReturnWorkflowStatus] ?? "return_submitted";
}

export function resolveChatStatusEventVariant(
  intent: string | null,
  content: string,
): ChatStatusEventVariant {
  if (parsePaymentRejectedIntent(intent)) return "payment_rejected";
  if (parseCodCollectionFailedIntent(intent)) return "cod_collection_failed";
  if (parsePaymentVerifiedIntent(intent)) return "payment_verified";
  if (parsePaymentSubmittedIntent(intent)) return "payment_submitted";
  if (parsePaymentRetrySubmittedIntent(intent)) return "payment_retry_submitted";
  if (parsePaymentMethodUpdatedIntent(intent)) return "payment_method_updated";

  const returnStatus = parseReturnStatusIntent(intent);
  if (returnStatus) {
    return mapReturnStatusToVariant(returnStatus.status);
  }

  if (
    intent?.startsWith(RETURN_CONFIRMED_INTENT_PREFIX) ||
    intent?.startsWith(RETURN_TRACKING_INTENT_PREFIX)
  ) {
    return "return_submitted";
  }

  if (parseOrderConfirmedIntent(intent)) {
    if (/UPI Verification Pending/i.test(content)) {
      return "order_received_pending";
    }
    return "order_confirmed";
  }

  const normalized = content.toLowerCase();
  if (normalized.includes("order delivered")) return "order_delivered";
  if (normalized.includes("order cancelled")) return "order_cancelled";
  if (/UPI Verification Pending/i.test(content)) return "order_received_pending";
  if (/payment not verified/i.test(content)) return "payment_rejected";
  if (/cod payment not collected/i.test(content)) return "cod_collection_failed";
  if (/payment retry submitted/i.test(content)) return "payment_retry_submitted";
  if (/payment submitted/i.test(content)) return "payment_submitted";
  if (/payment verified/i.test(content)) return "payment_verified";
  if (/return approved/i.test(content)) return "return_approved";
  if (/pickup scheduled/i.test(content)) return "pickup_scheduled";
  if (/refund processed/i.test(content)) return "refund_processed";
  if (/return submitted/i.test(content)) return "return_submitted";

  return "generic";
}

export function parseChatStatusEvent(input: {
  intent: string | null;
  content: string;
  createdAt: string;
}): ParsedChatStatusEvent {
  const variant = resolveChatStatusEventVariant(input.intent, input.content);
  const theme = CHAT_STATUS_EVENT_THEMES[variant];
  const lines = contentLines(input.content);
  const useContentTitle = variant === "generic" && lines.length > 0;
  const detailLines: string[] = [];

  for (const line of lines.slice(useContentTitle ? 1 : 1)) {
    if (/^status:/i.test(line)) continue;
    detailLines.push(line);
  }

  const statusValue = parseLineValue(input.content, "Status");

  return {
    variant,
    titleLine: useContentTitle
      ? lines[0]
      : `${theme.icon} ${theme.title}`,
    detailBlock: detailLines.join("\n"),
    statusLine: statusValue ? `Status: ${statusValue}` : null,
    timestamp: formatChatStatusEventTimestamp(input.createdAt),
  };
}

export function isChatStatusEventIntent(intent: string | null): boolean {
  if (!intent) return false;

  return (
    Boolean(parsePaymentRejectedIntent(intent)) ||
    Boolean(parseCodCollectionFailedIntent(intent)) ||
    Boolean(parsePaymentVerifiedIntent(intent)) ||
    Boolean(parsePaymentSubmittedIntent(intent)) ||
    Boolean(parsePaymentRetrySubmittedIntent(intent)) ||
    Boolean(parsePaymentMethodUpdatedIntent(intent)) ||
    Boolean(parseReturnStatusIntent(intent)) ||
    intent.startsWith(RETURN_CONFIRMED_INTENT_PREFIX) ||
    intent.startsWith(RETURN_TRACKING_INTENT_PREFIX) ||
    Boolean(parseOrderConfirmedIntent(intent))
  );
}

export function isPaymentStatusMessageIntent(intent: string | null): boolean {
  if (!intent) return false;
  return (
    Boolean(parsePaymentRejectedIntent(intent)) ||
    Boolean(parseCodCollectionFailedIntent(intent)) ||
    Boolean(parsePaymentVerifiedIntent(intent)) ||
    Boolean(parsePaymentSubmittedIntent(intent)) ||
    Boolean(parsePaymentRetrySubmittedIntent(intent)) ||
    Boolean(parsePaymentMethodUpdatedIntent(intent))
  );
}

export function isReturnStatusEventIntent(intent: string | null): boolean {
  if (!intent) return false;
  return (
    Boolean(parseReturnStatusIntent(intent)) ||
    intent.startsWith(RETURN_CONFIRMED_INTENT_PREFIX) ||
    intent.startsWith(RETURN_TRACKING_INTENT_PREFIX)
  );
}
