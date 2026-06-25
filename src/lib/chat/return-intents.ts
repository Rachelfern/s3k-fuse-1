import { RETURN_STATUS_INTENT_PREFIX } from "@/lib/orders/return-status-timeline";
import { resolveMessageIntent } from "@/lib/chat/quick-action-intent";

function withResolvedIntent(intent: string | null): string | null {
  if (!intent) return null;
  return resolveMessageIntent(intent) ?? intent;
}

export const RETURN_REASON_INTENT_PREFIX = "return_reason|";
export const RETURN_REASON_CHOICE_INTENT_PREFIX = "return_reason_choice|";
export const RETURN_PHOTO_INTENT_PREFIX = "return_photo|";
export const RETURN_ITEM_SELECT_INTENT_PREFIX = "return_item_select|";
export const RETURN_ITEM_PICK_INTENT_PREFIX = "return_item_pick|";
export const RETURN_CONFIRMED_INTENT_PREFIX = "return_confirmed|";
export const RETURN_TRACKING_INTENT_PREFIX = "return_tracking|";
export const SUPPORT_TICKET_INTENT_PREFIX = "support_ticket_created|";

export const RETURN_REASON_OPTIONS = [
  "Damaged Product",
  "Wrong Item Received",
  "Expired Product",
  "Quality Issue",
  "Missing Items",
  "Other",
] as const;

export type ReturnReasonOption = (typeof RETURN_REASON_OPTIONS)[number];

export type ReturnItemOption = {
  productId: string;
  label: string;
};

export function encodeReturnReasonIntent(requestId: string): string {
  return `${RETURN_REASON_INTENT_PREFIX}${requestId}`;
}

export function parseReturnReasonIntent(intent: string | null): string | null {
  const resolved = withResolvedIntent(intent);
  if (!resolved?.startsWith(RETURN_REASON_INTENT_PREFIX)) return null;
  return resolved.slice(RETURN_REASON_INTENT_PREFIX.length).trim() || null;
}

export function encodeReturnPhotoIntent(requestId: string): string {
  return `${RETURN_PHOTO_INTENT_PREFIX}${requestId}`;
}

export function parseReturnPhotoIntent(intent: string | null): string | null {
  const resolved = withResolvedIntent(intent);
  if (!resolved?.startsWith(RETURN_PHOTO_INTENT_PREFIX)) return null;
  return resolved.slice(RETURN_PHOTO_INTENT_PREFIX.length).trim() || null;
}

export function encodeReturnItemSelectIntent(
  orderId: string,
  items: ReturnItemOption[],
): string {
  const payload = items
    .map((item) => `${item.productId}:${item.label.replace(/,/g, " ")}`)
    .join(",");
  return `${RETURN_ITEM_SELECT_INTENT_PREFIX}${orderId}|${payload}`;
}

export function parseReturnItemSelectIntent(intent: string | null): {
  orderId: string;
  items: ReturnItemOption[];
} | null {
  const resolved = withResolvedIntent(intent);
  if (!resolved?.startsWith(RETURN_ITEM_SELECT_INTENT_PREFIX)) return null;

  const payload = resolved.slice(RETURN_ITEM_SELECT_INTENT_PREFIX.length);
  const pipeIndex = payload.indexOf("|");
  if (pipeIndex <= 0) return null;

  const orderId = payload.slice(0, pipeIndex).trim();
  const itemsSegment = payload.slice(pipeIndex + 1).trim();
  if (!orderId || !itemsSegment) return null;

  const items = itemsSegment
    .split(",")
    .map((segment) => {
      const colonIndex = segment.indexOf(":");
      if (colonIndex <= 0) return null;
      const productId = segment.slice(0, colonIndex).trim();
      const label = segment.slice(colonIndex + 1).trim();
      if (!productId || !label) return null;
      return { productId, label };
    })
    .filter((item): item is ReturnItemOption => Boolean(item));

  if (items.length === 0) return null;
  return { orderId, items };
}

export function encodeReturnItemPickIntent(input: {
  orderId: string;
  items: ReturnItemOption[];
  selectedProductIds: string[];
}): string {
  const allPayload = input.items
    .map((item) => `${item.productId}:${item.label.replace(/[:,|]/g, " ")}`)
    .join(",");
  const selected = input.selectedProductIds.join(",");
  return `${RETURN_ITEM_PICK_INTENT_PREFIX}${input.orderId}|${allPayload}|${selected}`;
}

export function parseReturnItemPickIntent(intent: string | null): {
  orderId: string;
  items: ReturnItemOption[];
  selectedProductIds: string[];
} | null {
  const resolved = withResolvedIntent(intent);
  if (!resolved?.startsWith(RETURN_ITEM_PICK_INTENT_PREFIX)) return null;

  const payload = resolved.slice(RETURN_ITEM_PICK_INTENT_PREFIX.length);
  const firstPipe = payload.indexOf("|");
  if (firstPipe <= 0) return null;

  const orderId = payload.slice(0, firstPipe).trim();
  const rest = payload.slice(firstPipe + 1);
  const secondPipe = rest.lastIndexOf("|");
  if (secondPipe <= 0) return null;

  const itemsSegment = rest.slice(0, secondPipe).trim();
  const selectedSegment = rest.slice(secondPipe + 1).trim();
  if (!orderId || !itemsSegment) return null;

  const items = itemsSegment
    .split(",")
    .map((segment) => {
      const colonIndex = segment.indexOf(":");
      if (colonIndex <= 0) return null;
      const productId = segment.slice(0, colonIndex).trim();
      const label = segment.slice(colonIndex + 1).trim();
      if (!productId || !label) return null;
      return { productId, label };
    })
    .filter((item): item is ReturnItemOption => Boolean(item));

  if (items.length === 0) return null;

  const selectedProductIds = selectedSegment
    ? selectedSegment.split(",").map((id) => id.trim()).filter(Boolean)
    : [];

  return { orderId, items, selectedProductIds };
}

export function encodeReturnReasonChoiceIntent(input: {
  orderId: string;
  mode: "entire" | "partial";
  productIds?: string[];
}): string {
  const productSegment =
    input.mode === "partial" && input.productIds?.length
      ? `|${input.productIds.join(",")}`
      : "";
  return `${RETURN_REASON_CHOICE_INTENT_PREFIX}${input.orderId}|${input.mode}${productSegment}`;
}

export function parseReturnReasonChoiceIntent(intent: string | null): {
  orderId: string;
  mode: "entire" | "partial";
  productIds: string[];
} | null {
  const resolved = withResolvedIntent(intent);
  if (!resolved?.startsWith(RETURN_REASON_CHOICE_INTENT_PREFIX)) return null;

  const payload = resolved.slice(RETURN_REASON_CHOICE_INTENT_PREFIX.length);
  const parts = payload.split("|");
  const orderId = parts[0]?.trim();
  const mode = parts[1]?.trim();
  if (!orderId || (mode !== "entire" && mode !== "partial")) return null;

  const productIds =
    mode === "partial" && parts[2]
      ? parts[2].split(",").map((id) => id.trim()).filter(Boolean)
      : [];

  return { orderId, mode, productIds };
}

export function encodeReturnConfirmedIntent(requestId: string): string {
  return `${RETURN_CONFIRMED_INTENT_PREFIX}${requestId}`;
}

export function parseReturnConfirmedIntent(intent: string | null): string | null {
  if (!intent?.startsWith(RETURN_CONFIRMED_INTENT_PREFIX)) return null;
  return intent.slice(RETURN_CONFIRMED_INTENT_PREFIX.length).trim() || null;
}

export function encodeReturnTrackingIntent(requestId: string): string {
  return `${RETURN_TRACKING_INTENT_PREFIX}${requestId}`;
}

export function parseReturnTrackingIntent(intent: string | null): string | null {
  if (!intent?.startsWith(RETURN_TRACKING_INTENT_PREFIX)) return null;
  return intent.slice(RETURN_TRACKING_INTENT_PREFIX.length).trim() || null;
}

export function parseReturnRequestIdFromFlowIntent(intent: string | null): string | null {
  const resolved = withResolvedIntent(intent);
  const statusUpdate = resolved?.startsWith(RETURN_STATUS_INTENT_PREFIX)
    ? (() => {
        const payload = resolved.slice(RETURN_STATUS_INTENT_PREFIX.length);
        const pipeIndex = payload.indexOf("|");
        if (pipeIndex <= 0) return null;
        return payload.slice(0, pipeIndex).trim() || null;
      })()
    : null;

  return (
    parseReturnReasonIntent(resolved) ??
    parseReturnPhotoIntent(resolved) ??
    parseReturnConfirmedIntent(resolved) ??
    parseReturnTrackingIntent(resolved) ??
    statusUpdate
  );
}

export function isReturnFlowIntent(intent: string | null): boolean {
  if (!intent) return false;
  return (
    intent.startsWith(RETURN_REASON_INTENT_PREFIX) ||
    intent.startsWith(RETURN_REASON_CHOICE_INTENT_PREFIX) ||
    intent.startsWith(RETURN_PHOTO_INTENT_PREFIX) ||
    intent.startsWith(RETURN_ITEM_SELECT_INTENT_PREFIX) ||
    intent.startsWith(RETURN_ITEM_PICK_INTENT_PREFIX) ||
    intent.startsWith(RETURN_CONFIRMED_INTENT_PREFIX) ||
    intent.startsWith(RETURN_TRACKING_INTENT_PREFIX) ||
    intent.startsWith(RETURN_STATUS_INTENT_PREFIX) ||
    intent.startsWith("return_order_card|") ||
    intent === "return_request" ||
    intent === "return_request_submitted" ||
    intent.startsWith("return_request|") ||
    intent.startsWith("refund_request|")
  );
}

export function encodeSupportTicketCreatedIntent(ticketId: string): string {
  return `${SUPPORT_TICKET_INTENT_PREFIX}${ticketId}`;
}
