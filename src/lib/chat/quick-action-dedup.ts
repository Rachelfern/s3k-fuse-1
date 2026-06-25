import { parseQuickActionTaggedIntent } from "@/lib/chat/quick-action-intent";
import {
  parseQuickAction,
  type QuickAction,
} from "@/lib/chat/quick-actions";
import type { Message } from "@/lib/types";

const REPEATABLE_COMMERCE_ACTIONS = new Set([
  "best_sellers",
  "view_cart",
  "browse_products",
  "continue_shopping",
  "reorder",
  "track_order",
  "refresh_status",
]);

export function serializeQuickActionKey(action: QuickAction): string {
  switch (action.type) {
    case "return_entire":
      return `return_entire:${action.orderId}`;
    case "return_item":
      return `return_item:${action.orderId}`;
    case "return_select_item":
      return `return_select_item:${action.orderId}:${action.productId}`;
    case "return_toggle_item":
      return `return_toggle_item:${action.orderId}:${action.productId}`;
    case "return_continue_items":
      return `return_continue_items:${action.orderId}`;
    case "return_set_reason":
      return `return_set_reason:${action.orderId}:${action.mode}`;
    case "return_skip_photo":
      return `return_skip_photo:${action.requestId}`;
    case "support_ticket":
      return `support_ticket:${action.orderId ?? "general"}`;
    case "track_return":
      return `track_return:${action.requestId ?? "latest"}`;
    default:
      return action.type;
  }
}

export function getQuickActionKey(message: string): string | null {
  const action = parseQuickAction(message);
  return action ? serializeQuickActionKey(action) : null;
}

export function isRepeatableCommerceQuickAction(actionKey: string): boolean {
  return REPEATABLE_COMMERCE_ACTIONS.has(actionKey);
}

export function adminMessageMatchesQuickAction(
  message: Message,
  actionKey: string,
): boolean {
  if (message.sender_type !== "admin" || !message.intent) return false;

  const tagged = parseQuickActionTaggedIntent(message.intent);
  if (tagged?.actionKey === actionKey) return true;

  // Only exact tagged quick-action responses dedupe — not broad intent families.
  // (e.g. a meal recommendation must not block a later Best Sellers tap.)
  return false;
}

export function getLatestAdminMessage(
  messages: Message[],
): Message | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.sender_type === "admin" && message.id !== "__typing__") {
      return message;
    }
  }
  return null;
}

export function shouldSkipDuplicateQuickAction(
  actionKey: string,
  messages: Message[],
): boolean {
  if (!isRepeatableCommerceQuickAction(actionKey)) return false;
  const latestAdmin = getLatestAdminMessage(messages);
  return latestAdmin
    ? adminMessageMatchesQuickAction(latestAdmin, actionKey)
    : false;
}

export function dedupeMessages(messages: Message[]): Message[] {
  const seenIds = new Set<string>();
  const seenAdminActionKeys = new Set<string>();
  const result: Message[] = [];

  for (const message of messages) {
    if (seenIds.has(message.id)) continue;
    seenIds.add(message.id);

    if (message.sender_type === "admin" && message.intent) {
      const tagged = parseQuickActionTaggedIntent(message.intent);
      if (tagged) {
        if (seenAdminActionKeys.has(tagged.actionKey)) continue;
        seenAdminActionKeys.add(tagged.actionKey);
      }
    }

    result.push(message);
  }

  return result;
}
