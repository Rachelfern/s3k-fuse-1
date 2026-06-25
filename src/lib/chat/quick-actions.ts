/**
 * Central registry for quick-action button payloads.
 * Every chip message should parse here before generic AI routing.
 */

export type QuickActionType =
  | "return_entire"
  | "return_item"
  | "return_select_item"
  | "return_toggle_item"
  | "return_continue_items"
  | "return_set_reason"
  | "return_skip_photo"
  | "support_ticket"
  | "contact_support"
  | "track_order"
  | "track_return"
  | "refresh_status"
  | "best_sellers"
  | "reorder"
  | "continue_shopping"
  | "help"
  | "view_cart"
  | "browse_products";

export type QuickAction =
  | { type: "return_entire"; orderId: string }
  | { type: "return_item"; orderId: string }
  | { type: "return_select_item"; orderId: string; productId: string }
  | { type: "return_toggle_item"; orderId: string; productId: string; selectedProductIds: string[] }
  | { type: "return_continue_items"; orderId: string; productIds: string[] }
  | {
      type: "return_set_reason";
      orderId: string;
      mode: "entire" | "partial";
      productIds: string[];
      reason: string;
    }
  | { type: "return_skip_photo"; requestId: string }
  | { type: "support_ticket"; orderId?: string }
  | { type: "contact_support" }
  | { type: "track_order" }
  | { type: "track_return"; requestId?: string }
  | { type: "refresh_status" }
  | { type: "best_sellers" }
  | { type: "reorder" }
  | { type: "continue_shopping" }
  | { type: "help" }
  | { type: "view_cart" }
  | { type: "browse_products" };

const LITERAL_ACTIONS: Record<string, QuickActionType> = {
  "contact support": "contact_support",
  "talk to support": "contact_support",
  "track order": "track_order",
  "track my order": "track_order",
  "track return": "track_return",
  "track my return": "track_return",
  "refresh status": "refresh_status",
  "best sellers": "best_sellers",
  reorder: "reorder",
  "continue shopping": "continue_shopping",
  help: "help",
  "view cart": "view_cart",
  "browse products": "browse_products",
};

export function parseQuickAction(message: string): QuickAction | null {
  const trimmed = message.trim();
  if (!trimmed) return null;

  const entireMatch = trimmed.match(/^return_entire\|(.+)$/i);
  if (entireMatch?.[1]) {
    return { type: "return_entire", orderId: entireMatch[1].trim() };
  }

  const itemMatch = trimmed.match(/^return_item\|(.+)$/i);
  if (itemMatch?.[1]) {
    return { type: "return_item", orderId: itemMatch[1].trim() };
  }

  const selectMatch = trimmed.match(/^return_select_item\|([^|]+)\|(.+)$/i);
  if (selectMatch?.[1] && selectMatch[2]) {
    return {
      type: "return_select_item",
      orderId: selectMatch[1].trim(),
      productId: selectMatch[2].trim(),
    };
  }

  const toggleMatch = trimmed.match(/^return_toggle_item\|([^|]+)\|([^|]+)(?:\|(.*))?$/i);
  if (toggleMatch?.[1] && toggleMatch[2]) {
    return {
      type: "return_toggle_item",
      orderId: toggleMatch[1].trim(),
      productId: toggleMatch[2].trim(),
      selectedProductIds: toggleMatch[3]
        ? toggleMatch[3].split(",").map((id) => id.trim()).filter(Boolean)
        : [],
    };
  }

  const continueMatch = trimmed.match(/^return_continue_items\|([^|]+)\|(.*)$/i);
  if (continueMatch?.[1]) {
    const productIds = continueMatch[2]
      ? continueMatch[2].split(",").map((id) => id.trim()).filter(Boolean)
      : [];
    return {
      type: "return_continue_items",
      orderId: continueMatch[1].trim(),
      productIds,
    };
  }

  const entireReasonMatch = trimmed.match(/^return_set_reason\|([^|]+)\|entire\|(.+)$/i);
  if (entireReasonMatch?.[1] && entireReasonMatch[2]) {
    return {
      type: "return_set_reason",
      orderId: entireReasonMatch[1].trim(),
      mode: "entire",
      productIds: [],
      reason: entireReasonMatch[2].trim(),
    };
  }

  const partialReasonMatch = trimmed.match(
    /^return_set_reason\|([^|]+)\|partial\|([^|]+)\|(.+)$/i,
  );
  if (partialReasonMatch?.[1] && partialReasonMatch[2] && partialReasonMatch[3]) {
    return {
      type: "return_set_reason",
      orderId: partialReasonMatch[1].trim(),
      mode: "partial",
      productIds: partialReasonMatch[2]
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean),
      reason: partialReasonMatch[3].trim(),
    };
  }

  const skipPhotoMatch = trimmed.match(/^return_skip_photo\|(.+)$/i);
  if (skipPhotoMatch?.[1]) {
    return { type: "return_skip_photo", requestId: skipPhotoMatch[1].trim() };
  }

  const supportMatch = trimmed.match(/^support_ticket(?:\|(.+))?$/i);
  if (supportMatch) {
    return {
      type: "support_ticket",
      orderId: supportMatch[1]?.trim() || undefined,
    };
  }

  const trackReturnMatch = trimmed.match(/^track_return\|(.+)$/i);
  if (trackReturnMatch?.[1]) {
    return {
      type: "track_return",
      requestId: trackReturnMatch[1].trim(),
    };
  }

  const literal = LITERAL_ACTIONS[trimmed.toLowerCase()];
  if (literal) {
    return { type: literal } as QuickAction;
  }

  return null;
}

export function isQuickActionMessage(message: string): boolean {
  return parseQuickAction(message) !== null;
}
