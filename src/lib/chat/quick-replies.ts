import {
  CART_CLARIFY_INTENT_PREFIX,
  CART_CONFIRM_INTENT_PREFIX,
  CART_CONFIRM_REPLY_PREFIX,
  CART_PICK_INTENT_PREFIX,
  parseCartClarifyOptions,
  parseCartConfirmIntent,
  RECOMMENDATION_INTENT_PREFIX,
} from "@/lib/ai/message-intent";
import { resolveMessageIntent } from "@/lib/chat/quick-action-intent";
import {
  buildCartActionQuickReplies,
  parseCartActionIntent,
} from "@/lib/chat/cart-action-messages";
import {
  parseReturnItemPickIntent,
  parseReturnItemSelectIntent,
  parseReturnPhotoIntent,
  parseReturnReasonChoiceIntent,
  parseReturnReasonIntent,
  parseReturnConfirmedIntent,
  parseReturnTrackingIntent,
  RETURN_REASON_OPTIONS,
} from "@/lib/chat/return-intents";
import { parseReturnOrderCardIntent } from "@/lib/orders/return-request-flow";
import { parseReturnStatusIntent } from "@/lib/orders/return-status-timeline";
import {
  parsePaymentRejectedIntent,
  parsePaymentVerifiedIntent,
  parsePaymentMethodUpdatedIntent,
  parsePaymentRetrySubmittedIntent,
  parsePaymentSubmittedIntent,
} from "@/lib/orders/payment-verification-flow";
import { parseCodCollectionFailedIntent } from "@/lib/orders/cod-collection-flow";

export const CHAT_INTENTS = {
  WELCOME: "welcome",
  WELCOME_SAMPLES: "welcome_samples",
  ORDER_CONFIRMED: "order_confirmed",
  ORDER_CONFIRMED_PREFIX: "order_confirmed|",
  ORDER_STATUS: "order_status",
  ORDER_HISTORY: "order_history",
  ORDER_HISTORY_PREFIX: "order_history|",
  CART_VIEW: "cart_view",
  CHECKOUT_PROMPT: "checkout_prompt",
  CHECKOUT_ADDRESS: "checkout_address",
  CART_UPDATED: "cart_updated",
  EMPTY_CART: "empty_cart",
  CONTACT_SUPPORT: "contact_support",
  CONTINUE_SHOPPING: "continue_shopping",
  BROWSE_PRODUCTS: "browse_products",
  RETURN_POLICY: "return_policy",
  REFUND_POLICY: "refund_policy",
  RETURN_REQUEST: "return_request",
  REFUND_REQUEST: "refund_request",
  RETURN_REQUEST_SUBMITTED: "return_request_submitted",
  RETURN_TRACKING: "return_tracking",
  RETURN_TRACKING_PREFIX: "return_tracking|",
  PRODUCT_SEARCH_EMPTY: "product_search_empty",
  PAYMENT_REJECTED_PREFIX: "payment_rejected|",
  PAYMENT_VERIFIED_PREFIX: "payment_verified|",
  PAYMENT_SUBMITTED_PREFIX: "payment_submitted|",
  PAYMENT_RETRY_SUBMITTED_PREFIX: "payment_retry_submitted|",
  PAYMENT_METHOD_UPDATED_PREFIX: "payment_method_updated|",
  GENERAL_REPLY: "general_reply",
  CLARIFICATION: "clarification",
  SUPPORT: "support",
  RETURN_REQUEST_PREFIX: "return_request|",
  REFUND_REQUEST_PREFIX: "refund_request|",
} as const;

export type QuickReply = {
  label: string;
  /** Send as a chat message when no href is set */
  message?: string;
  /** Open a dedicated commerce page (hybrid WhatsApp flow) */
  href?: string;
};

export const COMMERCE_ROUTES = {
  chat: "/chat",
  products: "/products",
  cart: "/cart",
  checkout: "/checkout",
  payment: "/payment",
  order: (orderId: string) => `/orders/${orderId}`,
  return: (returnId: string) => `/returns/${returnId}`,
} as const;

const POST_CART_REPLIES: QuickReply[] = [
  { label: "View Cart", href: COMMERCE_ROUTES.cart },
  { label: "Checkout", href: COMMERCE_ROUTES.checkout },
  { label: "Continue Shopping", href: COMMERCE_ROUTES.products },
];

const ORDER_STATUS_REPLIES: QuickReply[] = [
  { label: "Refresh Status", message: "track my order" },
  { label: "Continue Shopping", href: COMMERCE_ROUTES.products },
];

const RETURN_STATUS_REPLIES: QuickReply[] = [
  { label: "Refresh Status", message: "track my return" },
  { label: "Contact Support", message: "Contact Support" },
  { label: "Continue Shopping", href: COMMERCE_ROUTES.products },
];

function buildReturnTrackingReplies(requestId: string): QuickReply[] {
  return [
    { label: "Track Return", href: COMMERCE_ROUTES.return(requestId) },
    { label: "Refresh Status", message: `track_return|${requestId}` },
    { label: "Contact Support", message: "Contact Support" },
  ];
}

const REFUND_PROCESSED_REPLIES: QuickReply[] = [
  { label: "Contact Support", message: "Contact Support" },
  { label: "Continue Shopping", href: COMMERCE_ROUTES.products },
];

function buildReturnFlowReplies(requestId: string): QuickReply[] {
  return [
    { label: "Track Return", href: COMMERCE_ROUTES.return(requestId) },
    { label: "Contact Support", message: "Contact Support" },
  ];
}

const CART_VIEW_REPLIES: QuickReply[] = [
  { label: "Checkout", href: COMMERCE_ROUTES.checkout },
  { label: "Continue Shopping", href: COMMERCE_ROUTES.products },
];

const CHECKOUT_PROMPT_REPLIES: QuickReply[] = [
  { label: "Checkout", href: COMMERCE_ROUTES.checkout },
  { label: "Continue Shopping", href: COMMERCE_ROUTES.products },
];

const EMPTY_CART_REPLIES: QuickReply[] = [
  { label: "Best Sellers", message: "Best Sellers" },
  { label: "Browse Products", href: COMMERCE_ROUTES.products },
];

const CONTACT_SUPPORT_REPLIES: QuickReply[] = [
  { label: "Track Order", message: "track my order" },
  { label: "Continue Shopping", href: COMMERCE_ROUTES.products },
];

const POLICY_SUPPORT_REPLIES: QuickReply[] = [
  { label: "Track Order", message: "track my order" },
  { label: "Contact Support", message: "Contact Support" },
  { label: "Continue Shopping", href: COMMERCE_ROUTES.products },
];

function buildReturnRequestReplies(orderId: string): QuickReply[] {
  return [
    {
      label: "Return Entire Order",
      message: `return_entire|${orderId}`,
    },
    {
      label: "Select Items To Return",
      message: `return_item|${orderId}`,
    },
    { label: "Contact Support", message: `support_ticket|${orderId}` },
  ];
}

function buildReturnItemPickReplies(input: {
  orderId: string;
  items: { productId: string; label: string }[];
  selectedProductIds: string[];
}): QuickReply[] {
  const selectedCsv = input.selectedProductIds.join(",");
  const itemReplies = input.items.map((item) => {
    const isSelected = input.selectedProductIds.includes(item.productId);
    return {
      label: isSelected ? `✓ ${item.label}` : item.label,
      message: `return_toggle_item|${input.orderId}|${item.productId}|${selectedCsv}`,
    };
  });

  return [
    ...itemReplies,
    {
      label: "Continue Return",
      message: `return_continue_items|${input.orderId}|${selectedCsv}`,
    },
  ];
}

function buildReturnReasonReplies(input: {
  orderId: string;
  mode: "entire" | "partial";
  productIds: string[];
}): QuickReply[] {
  const productSegment =
    input.mode === "partial" && input.productIds.length
      ? `${input.productIds.join(",")}|`
      : "";

  return RETURN_REASON_OPTIONS.map((reason) => ({
    label: reason,
    message:
      input.mode === "entire"
        ? `return_set_reason|${input.orderId}|entire|${reason}`
        : `return_set_reason|${input.orderId}|partial|${input.productIds.join(",")}|${reason}`,
  }));
}

function buildReturnItemSelectReplies(
  orderId: string,
  items: { productId: string; label: string }[],
): QuickReply[] {
  return items.map((item) => ({
    label: item.label,
    message: `return_select_item|${orderId}|${item.productId}`,
  }));
}

function buildReturnPhotoReplies(requestId: string): QuickReply[] {
  return [
    {
      label: "Skip Photo Upload",
      message: `return_skip_photo|${requestId}`,
    },
    { label: "Track Return", href: COMMERCE_ROUTES.return(requestId) },
  ];
}

const CONTINUE_SHOPPING_REPLIES: QuickReply[] = [
  { label: "Best Sellers", message: "Best Sellers" },
  { label: "Browse Products", href: COMMERCE_ROUTES.products },
  { label: "View Cart", href: COMMERCE_ROUTES.cart },
];

const BROWSE_PRODUCTS_REPLIES: QuickReply[] = [
  { label: "Browse Products", href: COMMERCE_ROUTES.products },
  { label: "View Cart", href: COMMERCE_ROUTES.cart },
];

const WELCOME_REPLIES: QuickReply[] = [
  { label: "Browse Products", href: COMMERCE_ROUTES.products },
  { label: "Best Sellers", message: "Best Sellers" },
  { label: "Track Order", message: "track my order" },
  { label: "View Cart", href: COMMERCE_ROUTES.cart },
  { label: "Help", message: "Help" },
];

function buildPaymentRejectedReplies(orderId: string): QuickReply[] {
  return [
    {
      label: "Retry Payment",
      href: `${COMMERCE_ROUTES.payment}?orderId=${encodeURIComponent(orderId)}&retry=1`,
    },
    {
      label: "Upload Screenshot",
      href: COMMERCE_ROUTES.order(orderId),
    },
    { label: "Contact Support", message: "Contact Support" },
  ];
}

function buildCodCollectionFailedReplies(orderId: string): QuickReply[] {
  return [
    { label: "Contact Support", message: "Contact Support" },
    { label: "View Order", href: COMMERCE_ROUTES.order(orderId) },
    {
      label: "Change Payment Method",
      href: `${COMMERCE_ROUTES.payment}?orderId=${encodeURIComponent(orderId)}&retry=1`,
    },
  ];
}

function buildPaymentVerifiedReplies(orderId: string): QuickReply[] {
  return [
    { label: "Track Order", href: COMMERCE_ROUTES.order(orderId) },
    { label: "Browse Products", href: COMMERCE_ROUTES.products },
    { label: "Contact Support", message: "Contact Support" },
  ];
}

function buildPaymentSubmittedReplies(orderId: string): QuickReply[] {
  return [
    { label: "Track Order", href: COMMERCE_ROUTES.order(orderId) },
    { label: "Browse Products", href: COMMERCE_ROUTES.products },
    { label: "Contact Support", message: "Contact Support" },
  ];
}

function buildPaymentRetrySubmittedReplies(orderId: string): QuickReply[] {
  return [
    { label: "Track Order", href: COMMERCE_ROUTES.order(orderId) },
    { label: "Browse Products", href: COMMERCE_ROUTES.products },
    { label: "Contact Support", message: "Contact Support" },
  ];
}

function buildPaymentMethodUpdatedReplies(orderId: string): QuickReply[] {
  return [
    { label: "Track Order", href: COMMERCE_ROUTES.order(orderId) },
    { label: "Browse Products", href: COMMERCE_ROUTES.products },
  ];
}

function buildOrderConfirmedReplies(orderId: string | null): QuickReply[] {
  return [
    orderId
      ? { label: "Track Order", href: COMMERCE_ROUTES.order(orderId) }
      : { label: "Track Order", message: "track my order" },
    { label: "Browse Products", href: COMMERCE_ROUTES.products },
    { label: "Reorder", message: "Reorder" },
  ];
}

function buildCartConfirmReplies(intent: string): QuickReply[] {
  const items = parseCartConfirmIntent(intent);
  if (items.length === 0) return [];

  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
  const payload = items.map((item) => `${item.productId}:${item.quantity}`).join(",");

  return [
    {
      label: `Add ${totalQuantity} Pack${totalQuantity === 1 ? "" : "s"}`,
      message: `${CART_CONFIRM_REPLY_PREFIX}${payload}`,
    },
    {
      label: "Change Quantity",
      message: "I'd like a different quantity",
    },
  ];
}

function buildCartClarifyReplies(intent: string): QuickReply[] {
  return parseCartClarifyOptions(intent).map((option) => ({
    label: option.label,
    message: `${CART_PICK_INTENT_PREFIX}${option.productId}`,
  }));
}

export function encodeOrderConfirmedIntent(orderId: string): string {
  return `${CHAT_INTENTS.ORDER_CONFIRMED_PREFIX}${orderId}`;
}

export function parseOrderConfirmedIntent(intent: string | null): string | null {
  if (!intent?.startsWith(CHAT_INTENTS.ORDER_CONFIRMED_PREFIX)) return null;
  const orderId = intent.slice(CHAT_INTENTS.ORDER_CONFIRMED_PREFIX.length).trim();
  return orderId || null;
}

export function getQuickRepliesForIntent(intent: string | null): QuickReply[] {
  if (!intent) return [];

  const resolvedIntent = resolveMessageIntent(intent) ?? intent;

  const cartAction = parseCartActionIntent(resolvedIntent);
  if (cartAction) {
    return buildCartActionQuickReplies(cartAction);
  }

  if (resolvedIntent.startsWith(CART_CONFIRM_INTENT_PREFIX)) {
    return buildCartConfirmReplies(resolvedIntent);
  }

  if (resolvedIntent.startsWith(CART_CLARIFY_INTENT_PREFIX)) {
    return buildCartClarifyReplies(resolvedIntent);
  }

  if (resolvedIntent.startsWith(RECOMMENDATION_INTENT_PREFIX)) {
    return CONTINUE_SHOPPING_REPLIES;
  }

  if (resolvedIntent === CHAT_INTENTS.PRODUCT_SEARCH_EMPTY) {
    return EMPTY_CART_REPLIES;
  }

  if (resolvedIntent === CHAT_INTENTS.RETURN_REQUEST_SUBMITTED) {
    return RETURN_STATUS_REPLIES;
  }

  if (
    resolvedIntent === CHAT_INTENTS.RETURN_TRACKING ||
    resolvedIntent.startsWith(CHAT_INTENTS.RETURN_TRACKING_PREFIX)
  ) {
    const requestId = parseReturnTrackingIntent(resolvedIntent);
    return requestId ? buildReturnTrackingReplies(requestId) : RETURN_STATUS_REPLIES;
  }

  const returnReasonChoice = parseReturnReasonChoiceIntent(resolvedIntent);
  if (returnReasonChoice) {
    return buildReturnReasonReplies(returnReasonChoice);
  }

  const returnReasonId = parseReturnReasonIntent(resolvedIntent);
  if (returnReasonId) {
    return buildReturnFlowReplies(returnReasonId);
  }

  const returnConfirmedId = parseReturnConfirmedIntent(resolvedIntent);
  if (returnConfirmedId) {
    return buildReturnTrackingReplies(returnConfirmedId);
  }

  const returnStatusUpdate = parseReturnStatusIntent(resolvedIntent);
  if (returnStatusUpdate) {
    if (returnStatusUpdate.status === "refunded") {
      return REFUND_PROCESSED_REPLIES;
    }
    return buildReturnTrackingReplies(returnStatusUpdate.requestId);
  }

  const paymentRejectedOrderId = parsePaymentRejectedIntent(resolvedIntent);
  if (paymentRejectedOrderId) {
    return buildPaymentRejectedReplies(paymentRejectedOrderId);
  }

  const codCollectionFailedOrderId = parseCodCollectionFailedIntent(resolvedIntent);
  if (codCollectionFailedOrderId) {
    return buildCodCollectionFailedReplies(codCollectionFailedOrderId);
  }

  const paymentVerifiedOrderId = parsePaymentVerifiedIntent(resolvedIntent);
  if (paymentVerifiedOrderId) {
    return buildPaymentVerifiedReplies(paymentVerifiedOrderId);
  }

  const paymentSubmittedOrderId = parsePaymentSubmittedIntent(resolvedIntent);
  if (paymentSubmittedOrderId) {
    return buildPaymentSubmittedReplies(paymentSubmittedOrderId);
  }

  const paymentRetryOrderId = parsePaymentRetrySubmittedIntent(resolvedIntent);
  if (paymentRetryOrderId) {
    return buildPaymentRetrySubmittedReplies(paymentRetryOrderId);
  }

  const paymentMethodUpdatedOrderId = parsePaymentMethodUpdatedIntent(resolvedIntent);
  if (paymentMethodUpdatedOrderId) {
    return buildPaymentMethodUpdatedReplies(paymentMethodUpdatedOrderId);
  }

  if (
    resolvedIntent === CHAT_INTENTS.GENERAL_REPLY ||
    resolvedIntent === CHAT_INTENTS.CLARIFICATION
  ) {
    return CONTINUE_SHOPPING_REPLIES;
  }

  if (
    resolvedIntent === CHAT_INTENTS.ORDER_CONFIRMED ||
    resolvedIntent.startsWith(CHAT_INTENTS.ORDER_CONFIRMED_PREFIX)
  ) {
    return buildOrderConfirmedReplies(parseOrderConfirmedIntent(resolvedIntent));
  }

  if (resolvedIntent === CHAT_INTENTS.ORDER_STATUS) {
    return ORDER_STATUS_REPLIES;
  }

  if (resolvedIntent.startsWith(CHAT_INTENTS.ORDER_HISTORY_PREFIX)) {
    const orderIds = parseOrderHistoryIntent(resolvedIntent);
    return orderIds.map((orderId, index) => ({
      label: `Track Order ${index + 1}`,
      href: COMMERCE_ROUTES.order(orderId),
    }));
  }

  if (resolvedIntent === CHAT_INTENTS.CART_VIEW) {
    return CART_VIEW_REPLIES;
  }

  if (resolvedIntent === CHAT_INTENTS.CHECKOUT_PROMPT) {
    return CHECKOUT_PROMPT_REPLIES;
  }

  if (resolvedIntent === CHAT_INTENTS.CART_UPDATED) {
    return POST_CART_REPLIES;
  }

  if (resolvedIntent === CHAT_INTENTS.EMPTY_CART) {
    return EMPTY_CART_REPLIES;
  }

  if (resolvedIntent === CHAT_INTENTS.CONTACT_SUPPORT) {
    return CONTACT_SUPPORT_REPLIES;
  }

  if (
    resolvedIntent === CHAT_INTENTS.RETURN_POLICY ||
    resolvedIntent === CHAT_INTENTS.REFUND_POLICY
  ) {
    return POLICY_SUPPORT_REPLIES;
  }

  if (resolvedIntent.startsWith(CHAT_INTENTS.RETURN_REQUEST_PREFIX)) {
    const orderId = resolvedIntent.slice(CHAT_INTENTS.RETURN_REQUEST_PREFIX.length).trim();
    if (orderId) return buildReturnRequestReplies(orderId);
  }

  const returnOrderCardId = parseReturnOrderCardIntent(resolvedIntent);
  if (returnOrderCardId) {
    return buildReturnRequestReplies(returnOrderCardId);
  }

  if (resolvedIntent.startsWith(CHAT_INTENTS.REFUND_REQUEST_PREFIX)) {
    const orderId = resolvedIntent.slice(CHAT_INTENTS.REFUND_REQUEST_PREFIX.length).trim();
    if (orderId) return buildReturnRequestReplies(orderId);
  }

  const itemPick = parseReturnItemPickIntent(resolvedIntent);
  if (itemPick) {
    return buildReturnItemPickReplies(itemPick);
  }

  const itemSelect = parseReturnItemSelectIntent(resolvedIntent);
  if (itemSelect) {
    return buildReturnItemSelectReplies(itemSelect.orderId, itemSelect.items);
  }

  const photoRequestId = parseReturnPhotoIntent(resolvedIntent);
  if (photoRequestId) {
    return buildReturnPhotoReplies(photoRequestId);
  }

  if (resolvedIntent.startsWith("support_ticket_created|")) {
    return CONTACT_SUPPORT_REPLIES;
  }

  if (
    resolvedIntent === CHAT_INTENTS.RETURN_REQUEST ||
    resolvedIntent === CHAT_INTENTS.REFUND_REQUEST
  ) {
    return [
      { label: "Contact Support", message: "Contact Support" },
      { label: "Continue Shopping", href: COMMERCE_ROUTES.products },
    ];
  }

  if (resolvedIntent === CHAT_INTENTS.SUPPORT) {
    return CONTACT_SUPPORT_REPLIES;
  }

  if (resolvedIntent === CHAT_INTENTS.CONTINUE_SHOPPING) {
    return CONTINUE_SHOPPING_REPLIES;
  }

  if (resolvedIntent === CHAT_INTENTS.BROWSE_PRODUCTS) {
    return BROWSE_PRODUCTS_REPLIES;
  }

  if (resolvedIntent === CHAT_INTENTS.WELCOME) {
    return WELCOME_REPLIES;
  }

  return [];
}

export function getQuickRepliesForMessage(input: {
  intent: string | null;
  content?: string | null;
}): QuickReply[] {
  const replies = getQuickRepliesForIntent(input.intent);
  if (replies.length > 0) return replies;

  if (!input.content?.includes("Reason for return")) {
    return [];
  }

  const embeddedChoice = input.intent?.match(
    /return_reason_choice\|([^|]+)\|(entire|partial)(?:\|([^|]+))?/,
  );
  if (!embeddedChoice?.[1] || !embeddedChoice[2]) {
    return [];
  }

  return buildReturnReasonReplies({
    orderId: embeddedChoice[1],
    mode: embeddedChoice[2] as "entire" | "partial",
    productIds: embeddedChoice[3]
      ? embeddedChoice[3].split(",").map((id) => id.trim()).filter(Boolean)
      : [],
  });
}

export function parseOrderHistoryIntent(intent: string | null): string[] {
  if (!intent?.startsWith(CHAT_INTENTS.ORDER_HISTORY_PREFIX)) return [];
  return intent
    .slice(CHAT_INTENTS.ORDER_HISTORY_PREFIX.length)
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

export function encodeOrderHistoryIntent(orderIds: string[]): string {
  return `${CHAT_INTENTS.ORDER_HISTORY_PREFIX}${orderIds.join(",")}`;
}

/** Resolve a quick reply tap — navigate to page or fall back to chat message */
export function resolveQuickReplyAction(reply: QuickReply): {
  type: "navigate" | "message";
  href?: string;
  message?: string;
} {
  if (reply.href) {
    return { type: "navigate", href: reply.href };
  }
  if (reply.message) {
    return { type: "message", message: reply.message };
  }
  return { type: "message", message: reply.label };
}
