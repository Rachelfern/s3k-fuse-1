import { resolveMessageIntent } from "@/lib/chat/quick-action-intent";
import {
  detectCommerceIntent,
  isRefundPolicyRequest,
  isReturnPolicyRequest,
  isSupportRequest,
  parseRecommendationProductIds,
} from "@/lib/ai/message-intent";
import { isOffersQuery } from "@/lib/ai/product-query";

export type ChatIntentCategory =
  | "product_search"
  | "recommendation"
  | "offers"
  | "return_tracking"
  | "order_tracking"
  | "return_request"
  | "return_policy"
  | "refund_request"
  | "refund_policy"
  | "complaint"
  | "support";

const PRODUCT_CARD_CATEGORIES = new Set<ChatIntentCategory>([
  "product_search",
  "recommendation",
  "offers",
]);

export function classifyChatIntentCategory(
  message: string,
): ChatIntentCategory | null {
  const commerceIntent = detectCommerceIntent(message);

  if (commerceIntent === "RETURN_REQUEST") return "return_request";
  if (commerceIntent === "REFUND_REQUEST") return "refund_request";
  if (commerceIntent === "COMPLAINT") return "complaint";
  if (isReturnPolicyRequest(message)) return "return_policy";
  if (isRefundPolicyRequest(message)) return "refund_policy";
  if (isSupportRequest(message)) return "support";
  if (commerceIntent === "TRACK_RETURN") return "return_tracking";
  if (commerceIntent === "TRACK_ORDER") return "order_tracking";
  if (commerceIntent === "PAYMENT_ISSUE") return "support";
  if (isOffersQuery(message)) return "offers";

  if (commerceIntent === "PRODUCT_SEARCH") return "product_search";
  if (commerceIntent === "RECOMMENDATION") return "recommendation";
  if (commerceIntent === "PRODUCT_CATALOG") return "product_search";

  return null;
}

/** Product cards only for explicit recommendation intents from product flows. */
export function shouldShowProductCards(intent: string | null): boolean {
  if (!intent) return false;
  return parseRecommendationProductIds(resolveMessageIntent(intent)).length > 0;
}

export function isProductCardCategory(category: ChatIntentCategory): boolean {
  return PRODUCT_CARD_CATEGORIES.has(category);
}
