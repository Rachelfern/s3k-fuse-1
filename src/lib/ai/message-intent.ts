import { resolveMessageIntent } from "@/lib/chat/quick-action-intent";
import {
  normalizeCommerceMessage,
  normalizeCommercePhrases,
  normalizeProductAliases,
} from "@/lib/hinglish";

export const RECOMMENDATION_INTENT_PREFIX = "recommendation|";

/** Expand Hinglish + chat shorthand before intent pattern matching. */
export function normalizeIntentMessage(message: string): string {
  return normalizeProductAliases(normalizeCommercePhrases(message))
    .replace(/\bur\b/gi, "your")
    .replace(/\bu\b/gi, "you");
}

export type CustomerMessageIntent =
  | "CART_ADD"
  | "CART_REMOVE"
  | "PRODUCT_DISCOVERY"
  | "OTHER";

export type CommerceIntentType =
  | "CART_VIEW"
  | "CART_ADD"
  | "CART_REMOVE"
  | "CHECKOUT"
  | "TRACK_ORDER"
  | "TRACK_RETURN"
  | "PRODUCT_CATALOG"
  | "PRODUCT_SEARCH"
  | "RECOMMENDATION"
  | "RETURN_REQUEST"
  | "REFUND_REQUEST"
  | "COMPLAINT"
  | "RETURN_POLICY"
  | "REFUND_POLICY"
  | "SUPPORT"
  | "PAYMENT_ISSUE"
  | "GENERAL_CHAT";

export const CART_VIEW_PATTERNS = [
  /^view cart$/i,
  /^show cart$/i,
  /^(?:my|show|view|see|check|open)\s+(?:my\s+)?cart$/i,
  /^what(?:'s| is) in my cart\??$/i,
  /^i want to view my cart$/i,
  /^(?:show|view|see|check)\s+(?:what(?:'s| is))\s+in\s+(?:my\s+)?cart$/i,
];

const CART_REMOVE_PATTERNS = [
  /\bremove\b/i,
  /\bdelete\b/i,
  /\btake\b.+\bout\b/i,
  /\bremove\b.+\bfrom\s+cart\b/i,
  /\bdiscard\b/i,
  /\bcancel\s+item\b/i,
  /\bdon'?t\s+want\b/i,
  /\bexclude\b/i,
];

const CHECKOUT_PATTERNS = [/^checkout$/i, /^place order$/i, /^ready to checkout$/i];

const TRACK_ORDER_PATTERNS = [
  /^track(?:\s+(?:my\s+)?order)(?:\s+(.+))?$/i,
  /^track order(?:\s+(.+))?$/i,
  /^where(?:'s| is) my order\??$/i,
  /^order status$/i,
  /^delivery status$/i,
];

const TRACK_RETURN_PATTERNS = [
  /^track(?:\s+(?:my\s+)?return)(?:\s+(.+))?$/i,
  /^track return(?:\s+(.+))?$/i,
  /^where(?:'s| is) my return\??$/i,
  /^return status$/i,
  /^check(?:\s+my)?\s+return(?:\s+status)?$/i,
  /^track_return\|(.+)$/i,
];

export const PRODUCT_CATALOG_PATTERNS = [
  /^products?$/i,
  /^catalog$/i,
  /^inventory$/i,
  /^menu$/i,
  /\b(?:show|browse|view|see|list|display)\s+(?:me\s+)?(?:the\s+|(?:ur|your)\s+|all\s+)?(?:products?|catalog(?:ue)?|inventory|menu|items?)\b/i,
  /\b(?:i\s+)?want\s+to\s+(?:view|see|browse|show)\s+(?:the\s+|(?:ur|your)\s+)?(?:products?|catalog(?:ue)?|inventory|menu|items?)\b/i,
  /\bwhat\s+(?:products?|items?)\s+(?:do\s+(?:u|you)\s+(?:have|sell|offer|carry)|are\s+(?:there|available))\b/i,
  /\bwhat\s+(?:do\s+(?:u|you)\s+(?:have|sell|offer|carry))\b/i,
  /\bwhat\s+items?\s+(?:do\s+(?:u|you)\s+)?have\b/i,
  /\b(?:show|view)\s+(?:your|the)\s+catalog(?:ue)?\b/i,
  /\bshow\s+(?:your\s+)?inventory\b/i,
  /\bview\s+catalog(?:ue)?\b/i,
  /\b(?:products?|items?|catalog(?:ue)?)\s+(?:u|you)\s+have\b/i,
  /\b(?:view|see|show)\b.+\b(?:products?|catalog(?:ue)?|inventory|menu|items?)\b/i,
];

const PRODUCT_SEARCH_PATTERNS = [
  /\bbest sellers?\b/i,
  /\bpopular products?\b/i,
  /\btrending items?\b/i,
  /\btrending products?\b/i,
  /\btop sellers?\b/i,
  /\bmost (?:ordered|sold|popular)\b/i,
  /\bwhat(?:'s| is) (?:available|on (?:the )?menu)\b/i,
  /\bshow me\b.+\b(?:product|products|items|options|catalog)\b/i,
  /\b(?:do\s+(?:u|you)\s+have|have\s+(?:u|you)\s+got|got\s+any)\b/i,
  /\b(?:today'?s?\s+)?(?:offers?|deals?|discounts?|sales?)\b/i,
  /\bshow\s+(?:today'?s?\s+)?(?:offers?|deals?)\b/i,
  /\bshow\s+me\b/i,
  /\bhow much\b/i,
  /\bwhat(?:'s| is) the price\b/i,
  /\bprice of\b/i,
];

const RETURN_REQUEST_PATTERNS = [
  /\bi\s+want\s+to\s+return\b/i,
  /\breturn\s+(?:this|that|my|the|what\s+i)\b/i,
  /\breturn\s+what\s+i\s+(?:just\s+)?ordered\b/i,
  /\b(?:received|got)\s+a\s+(?:damaged|wrong|defective|spoiled|bad|expired)\b/i,
  /\b(?:damaged|wrong|defective|spoiled|expired)\s+(?:product|item|order|delivery)\b/i,
  /\b(?:damaged|wrong\s+item|broken|defective)\b/i,
  /\bneed\s+to\s+return\b/i,
  /\bstart\s+a\s+return\b/i,
  /\brequest\s+a\s+return\b/i,
  /\b(?:unhappy|not\s+happy|dissatisfied|disappointed)\s+with\s+(?:my|the)\s+order\b/i,
  /\b(?:unhappy|not\s+happy|dissatisfied|disappointed)\s+with\s+(?:the\s+)?quality\b/i,
  /\b(?:my|the)\s+order\s+(?:is|was)\s+(?:wrong|bad|damaged|spoiled|disappointing)\b/i,
  /\bissue\s+with\s+(?:my\s+)?order\b/i,
];

const REFUND_REQUEST_PATTERNS = [
  /\bi\s+want\s+a\s+refund\b/i,
  /\b(?:request|need)\s+a\s+refund\b/i,
  /\bget\s+(?:a\s+)?refund\b/i,
  /\bget\s+my\s+money\s+back\b/i,
  /\brefund\s+(?:this|my|the)\s+order\b/i,
  /\bwant\s+(?:my\s+)?(?:money|payment)\s+back\b/i,
];

const COMPLAINT_PATTERNS = [
  /\bcomplaint\b/i,
  /\bfile\s+(?:a\s+)?complaint\b/i,
  /\bquality\s+issue\b/i,
  /\bpoor\s+quality\b/i,
  /\bbad\s+quality\b/i,
  /\bunhappy\b/i,
];

const PAYMENT_ISSUE_PATTERNS = [
  /\b(?:payment|paid|upi|transaction|utr)\b.{0,40}\b(?:failed|missing|issue|problem|not\s+received|deducted|pending)\b/i,
  /\b(?:payment|paid)\s+(?:failed|issue|problem|missing|pending)\b/i,
  /\bmoney\s+(?:deducted|debited)\b/i,
  /\b(?:didn'?t|did\s+not)\s+(?:receive|get)\s+(?:payment\s+)?confirmation\b/i,
  /\bdouble\s+(?:charge|deduction|payment|debit)\b/i,
];

const RETURN_POLICY_PATTERNS = [
  /\breturn\s+policy\b/i,
  /\breturns?\s+and\s+exchanges?\b/i,
  /\bwhat(?:'s| is)\s+(?:your|the)\s+return\b/i,
  /\bhow\s+(?:do|does)\s+returns?\s+work\b/i,
  /\bhow\s+(?:do|can)\s+i\s+return\b/i,
  /\bcan\s+i\s+return\b/i,
];

const REFUND_POLICY_PATTERNS = [
  /\brefund\s+policy\b/i,
  /\bwhat(?:'s| is)\s+(?:your|the)\s+refund\b/i,
  /\bhow\s+(?:do|can)\s+i\s+(?:get\s+a\s+)?refund\b/i,
  /\bmoney[\s-]?back\s+policy\b/i,
  /\b(?:refund|money back)\s+(?:policy|process|timeline)\b/i,
  /\bwhen\s+(?:will|do)\s+i\s+(?:get|receive)\s+(?:my\s+)?refund\b/i,
];

const SUPPORT_PATTERNS = [
  /^help$/i,
  /^i need help$/i,
  /^contact support$/i,
  /\b(?:customer|technical)\s+support\b/i,
  /\bspeak\s+(?:to|with)\s+(?:a\s+)?(?:human|agent|representative|person)\b/i,
  /\b(?:delivery|shipping)\s+(?:policy|issue|problem)\b/i,
  /\b(?:warranty|guarantee)\s+policy\b/i,
];

const MEAL_PLANNING_PATTERNS = [
  /\bhigh[\s-]?protein\b/i,
  /\b(?:i\s+)?want\s+(?:a\s+)?(?:high[\s-]?protein\s+)?(?:healthy\s+)?(?:\w+\s+){0,4}(?:lunch|breakfast|dinner|snack|meal)s?\b/i,
  /\b(?:lunch|breakfast|dinner|snack|meal)s?\s+(?:ideas?|suggestions?|options?)\b/i,
  /\bmeal\s+(?:ideas?|suggestions?|options?|plan(?:ning)?)\b/i,
  /\bweight[\s-]?loss\b/i,
  /\b(?:low[\s-]?cal(?:orie)?|keto|vegan|vegetarian)\s+(?:meal|food|lunch|dinner|breakfast|snack)s?\b/i,
  /\bhealthy\s+(?:food|foods|meal|meals|lunch|dinner|breakfast|snack|snacks|options?|ideas?)\b/i,
  /\bwhat\s+can\s+i\s+cook\b/i,
  /\bcook\s+with\s+(?:these\s+)?ingredients\b/i,
];

const BASKET_RECOMMENDATION_PATTERNS = [
  ...MEAL_PLANNING_PATTERNS,
  /\bwhat should i (?:cook|make|eat|prepare|buy|order|get)\b/i,
  /\bwhat (?:to|can i|should i) (?:cook|make|eat|prepare|buy|get)\b/i,
  /\bcook(?:ing)?\s+(?:tonight|today|for\s+(?:dinner|lunch|breakfast))\b/i,
  /\b(?:dinner|lunch|breakfast)\s+(?:ideas?|suggestions?|options?)\b/i,
  /\bingredients?\s+(?:for|to)\b/i,
  /\b(?:bake|baking)\b/i,
  /\bgroceries\s+for\b/i,
  /\b(?:for|feed)\s+\d+\s+people\b/i,
  /\b(?:for|feed)\s+(?:two|three|four|five|six)\s+people\b/i,
  /\bsnacks?\b/i,
  /\b(?:recipe|meal prep|meal plan)\b/i,
  /\b(?:party|picnic|bbq|barbecue)\s+(?:food|groceries|items?)\b/i,
  /\bweekly\s+(?:groceries|shopping)\b/i,
  /\b(?:pantry|kitchen)\s+essentials?\b/i,
  /\btonight\b/i,
];

const RECOMMENDATION_PATTERNS = [
  ...BASKET_RECOMMENDATION_PATTERNS,
  /\brecommend(?:ation)?s?\b/i,
  /\bsuggest(?:ion)?s?\b/i,
  /\bwhat\b.+\brecommend\b/i,
  /\brecommend\b.+\b(?:buy|get|order)\b/i,
  /\bsuggest\b.+\bproducts?\b/i,
  /\bhealthy\b/i,
  /\bunder\s*[₹$]?\s*\d+/i,
  /\bbreakfast\b/i,
  /\blunch\b/i,
  /\bdinner\b/i,
  /\bgift\b/i,
  /\b(?:meal|meals)\b/i,
  /\bprotein[\s-]?rich\b/i,
  /\bhigh in\b/i,
  /\bvitamin\b/i,
];

const DISCOVERY_PATTERNS = [
  ...RECOMMENDATION_PATTERNS,
  /\bshow me\b/i,
  /\bshow\b.+\b(?:fruit|fruits|vegetable|vegetables|dairy|product|products|items|options)\b/i,
  /\bbrowse\b/i,
  /\b(?:fruit|fruits|vegetable|vegetables|veggies|dairy)\b/i,
];

const EXPLICIT_CART_PATTERNS = [
  /\badd\s+(\d+\s*)?[a-z]/i,
  /\badd\b.+\bto (?:my )?cart\b/i,
  /\badd\b.+\b(?:in|into)\s+(?:my )?cart\b/i,
  /\bput\b.+\b(?:in|into|to)\s+(?:my\s+)?(?:cart|basket|bag)\b/i,
  /\bput (?:this|it|that) (?:in|to) (?:my )?cart\b/i,
  /\bi(?:'ll| will) take (?:this|that|the|option|\d)/i,
  /\btake option\s*\d+/i,
  /\badd option\s*\d+/i,
  /\border\s+(?:\d+\s*x?\s*)?[a-z]{3,}/i,
  /\b(?:i\s+)?want\s+(?:to\s+)?(?:add|get|buy)\b/i,
  /\b(?:i\s+)?want\s+\d/i,
  /\b(?:i\s+)?want\s+(?!(?:to\s+)?(?:return|refund|file|complain)\b)(?!(?:to\s+)?(?:view|see|browse|show|order|buy|add|get|some\s+recommendations?)\b)(?!.*\b(?:fruit|fruits|vegetable|vegetables|veggies|recommendations?|catalog(?:ue)?|products?|items?|menu|inventory|complaint|refund|return|quality|damaged|broken|defective|support)\b)\w+/i,
  /\b(?:i\s+)?need\s+\d/i,
  /\b(?:get|buy|purchase)\s+\d/i,
  /\b(?:get|buy|purchase)\s+(?:some\s+)?[a-z]{3,}/i,
  /\b\d+\s+(?!you|u|not|want|have|i|we|the|a|an\b)[a-z]{3,}\b/i,
  /\b(?:ek|do|teen|chaar|char|paanch|chhe)\s+(?!you|u|not|want|have|i|we|the|a|an\b)[a-z]{3,}\b/i,
  /^cart_confirm\|/i,
  /^cart_pick\|/i,
  /^cart_confirm_reply\|/i,
];

export const CART_CONFIRM_INTENT_PREFIX = "cart_confirm|";
export const CART_PICK_INTENT_PREFIX = "cart_pick|";
export const CART_CONFIRM_REPLY_PREFIX = "cart_confirm_reply|";
export const CART_CLARIFY_INTENT_PREFIX = "cart_clarify|";

function isVagueOrderRequest(message: string): boolean {
  return (
    /\b(?:want to|would like to|looking to|i want to|i want a)\s+(?:order|buy|get)\b/i.test(
      message,
    ) &&
    !/\b(?:add|order)\s+(?:\d+\s*)?(?:dal|paneer|rajma|naan|lassi|chole|butter)/i.test(
      message,
    )
  );
}

export function isCartViewRequest(message: string): boolean {
  const trimmed = message.trim();
  return CART_VIEW_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export function isBasketRecommendationRequest(message: string): boolean {
  return BASKET_RECOMMENDATION_PATTERNS.some((pattern) => pattern.test(message));
}

export function isMealPlanningRequest(message: string): boolean {
  return MEAL_PLANNING_PATTERNS.some((pattern) => pattern.test(message));
}

export function isBudgetRecommendationRequest(message: string): boolean {
  return /\bunder\s*[₹$]?\s*\d+/i.test(message);
}

export function isExplicitProductCartRequest(message: string): boolean {
  const probe = normalizeIntentMessage(message.trim());

  if (isBasketRecommendationRequest(probe)) return false;
  if (isBudgetRecommendationRequest(probe) && !/\b(?:add|order|buy|get)\s+\d/i.test(probe)) {
    return false;
  }
  if (
    isRecommendationRequest(probe) &&
    !/\b(?:add|put|order|buy|get)\s+(?:\d+\s*)?[a-z]{3,}/i.test(probe)
  ) {
    return false;
  }
  if (/\b(?:need|want)\b.+\b(?:for\s+\d+\s+people|\d+\s+people)\b/i.test(probe)) {
    return false;
  }

  if (/\b(?:add|put|order|buy|purchase|get)\s+(?:\d+\s*)?[a-z]{3,}/i.test(probe)) {
    return true;
  }
  if (/\b(?:i\s+)?want\s+(?:\d+\s*)?[a-z]{3,}/i.test(probe)) return true;
  if (
    /\b(?:i\s+)?need\s+(?:\d+\s*)?[a-z]{3,}/i.test(probe) &&
    !/\b(?:for|people|persons?)\b/i.test(probe)
  ) {
    return true;
  }

  return EXPLICIT_CART_PATTERNS.some((pattern) => pattern.test(probe));
}

export function isPostOrderIssueRequest(message: string): boolean {
  const probe = normalizeIntentMessage(message.trim());
  return (
    isReturnRequest(probe) ||
    isRefundRequest(probe) ||
    isComplaintRequest(probe) ||
    isSupportRequest(probe) ||
    isPaymentIssueRequest(probe) ||
    isTrackOrderRequest(probe) ||
    isTrackReturnRequest(probe)
  );
}

export function isExplicitProductLookup(message: string): boolean {
  const probe = normalizeIntentMessage(message.trim());

  if (isPostOrderIssueRequest(probe)) {
    return false;
  }

  if (
    isRecommendationRequest(probe) ||
    isBasketRecommendationRequest(probe) ||
    isMealPlanningRequest(probe)
  ) {
    return false;
  }

  if (/\b(?:do\s+(?:u|you)\s+have|have\s+(?:u|you)\s+got|got\s+any)\b/i.test(probe)) {
    return true;
  }

  if (isProductSearchRequest(probe)) {
    if (/\bshow\s+me\b/i.test(probe) && !/\bshow\s+me\s+[a-z]{3,}/i.test(probe)) {
      return false;
    }
    return true;
  }

  return isExplicitProductCartRequest(probe);
}

export function isCartAddRequest(message: string): boolean {
  if (isPostOrderIssueRequest(message)) {
    return false;
  }

  if (/\border\s+(?:kaha|kahan|kha)\b/i.test(message)) {
    return false;
  }

  if (isBasketRecommendationRequest(message)) {
    return false;
  }

  if (/\b(?:need|want)\b.+\b(?:for\s+\d+\s+people|\d+\s+people)\b/i.test(message)) {
    return false;
  }

  if (
    isRecommendationRequest(message) &&
    !/\b(?:add|put|order|buy|get)\s+(?:\d+\s*)?[a-z]{3,}/i.test(message) &&
    !/\b(?:add|put)\b.+\b(?:cart|basket|bag)\b/i.test(message)
  ) {
    return false;
  }

  return (
    EXPLICIT_CART_PATTERNS.some((pattern) => pattern.test(message)) ||
    /\b(?:buy|purchase)\s+\w/i.test(message)
  );
}

export function isCartRemoveRequest(message: string): boolean {
  if (
    /\bdon'?t\s+want\s+((?:recommendations?|any\s+(?:more\s+)?recommendations?))\b/i.test(
      message,
    )
  ) {
    return false;
  }

  return CART_REMOVE_PATTERNS.some((pattern) => pattern.test(message));
}

export function isCheckoutRequest(message: string): boolean {
  return CHECKOUT_PATTERNS.some((pattern) => pattern.test(message.trim()));
}

export function isTrackOrderRequest(message: string): boolean {
  const trimmed = message.trim();
  if (isTrackReturnRequest(trimmed)) return false;
  return TRACK_ORDER_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export function isTrackReturnRequest(message: string): boolean {
  return TRACK_RETURN_PATTERNS.some((pattern) => pattern.test(message.trim()));
}

export function parseTrackReturnRequestId(message: string): string | null {
  const match = message.trim().match(/^track_return\|(.+)$/i);
  return match?.[1]?.trim() || null;
}

export function isProductCatalogRequest(message: string): boolean {
  const trimmed = message.trim();
  return PRODUCT_CATALOG_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export function isProductSearchRequest(message: string): boolean {
  return PRODUCT_SEARCH_PATTERNS.some((pattern) => pattern.test(message.trim()));
}

export function isRecommendationRequest(message: string): boolean {
  return RECOMMENDATION_PATTERNS.some((pattern) => pattern.test(message));
}

export function isReturnRequest(message: string): boolean {
  const trimmed = message.trim();
  if (isReturnPolicyRequest(trimmed) && !RETURN_REQUEST_PATTERNS.some((p) => p.test(trimmed))) {
    return false;
  }
  if (RETURN_REQUEST_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return true;
  }
  return /\breturn\b/i.test(trimmed) && !isReturnPolicyRequest(trimmed);
}

export function isRefundRequest(message: string): boolean {
  const trimmed = message.trim();
  if (isRefundPolicyRequest(trimmed) && !REFUND_REQUEST_PATTERNS.some((p) => p.test(trimmed))) {
    return false;
  }
  if (REFUND_REQUEST_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return true;
  }
  return /\brefund\b/i.test(trimmed) && !isRefundPolicyRequest(trimmed);
}

export function isComplaintRequest(message: string): boolean {
  const trimmed = message.trim();
  if (
    isReturnRequest(trimmed) ||
    isRefundRequest(trimmed) ||
    isReturnPolicyRequest(trimmed) ||
    isRefundPolicyRequest(trimmed)
  ) {
    return false;
  }
  return COMPLAINT_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export function isPaymentIssueRequest(message: string): boolean {
  const trimmed = message.trim();
  return PAYMENT_ISSUE_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export function isReturnPolicyRequest(message: string): boolean {
  const trimmed = message.trim();
  return RETURN_POLICY_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export function isRefundPolicyRequest(message: string): boolean {
  const trimmed = message.trim();
  if (isReturnPolicyRequest(trimmed) && !/\brefund\b/i.test(trimmed)) {
    return false;
  }
  return REFUND_POLICY_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export function isSupportRequest(message: string): boolean {
  const trimmed = message.trim();
  if (
    isReturnPolicyRequest(trimmed) ||
    isRefundPolicyRequest(trimmed) ||
    isReturnRequest(trimmed) ||
    isRefundRequest(trimmed) ||
    isComplaintRequest(trimmed) ||
    isPaymentIssueRequest(trimmed)
  ) {
    return false;
  }
  return SUPPORT_PATTERNS.some((pattern) => pattern.test(trimmed));
}

function intentProbeTexts(message: string): string[] {
  const trimmed = message.trim();
  if (!trimmed) return [];

  const normalized = normalizeIntentMessage(trimmed);
  if (normalized === trimmed.toLowerCase()) {
    return [trimmed];
  }

  return [normalized, trimmed];
}

function detectCommerceIntentFromProbe(probe: string): CommerceIntentType | null {
  if (isCartViewRequest(probe)) return "CART_VIEW";
  if (isReturnRequest(probe)) return "RETURN_REQUEST";
  if (isRefundRequest(probe)) return "REFUND_REQUEST";
  if (isComplaintRequest(probe)) return "COMPLAINT";
  if (isSupportRequest(probe)) return "SUPPORT";
  if (isTrackReturnRequest(probe)) return "TRACK_RETURN";
  if (isTrackOrderRequest(probe)) return "TRACK_ORDER";
  if (isPaymentIssueRequest(probe)) return "PAYMENT_ISSUE";
  if (isReturnPolicyRequest(probe)) return "RETURN_POLICY";
  if (isRefundPolicyRequest(probe)) return "REFUND_POLICY";
  if (isCartRemoveRequest(probe)) return "CART_REMOVE";
  if (isCheckoutRequest(probe)) return "CHECKOUT";
  if (isProductCatalogRequest(probe)) return "PRODUCT_CATALOG";
  if (isRecommendationRequest(probe)) return "RECOMMENDATION";
  if (isProductSearchRequest(probe)) return "PRODUCT_SEARCH";
  if (isCartAddRequest(probe)) return "CART_ADD";
  return null;
}

export function detectCommerceIntent(message: string): CommerceIntentType {
  const probes = intentProbeTexts(message);
  if (probes.length === 0) return "GENERAL_CHAT";

  for (const probe of probes) {
    const intent = detectCommerceIntentFromProbe(probe);
    if (intent) return intent;
  }

  const hasDiscovery = probes.some((candidate) =>
    DISCOVERY_PATTERNS.some((pattern) => pattern.test(candidate)),
  );
  const vagueOrder = probes.some((candidate) => isVagueOrderRequest(candidate));
  if (hasDiscovery || vagueOrder) return "RECOMMENDATION";

  return "GENERAL_CHAT";
}

export function explainIntentFallback(message: string): string {
  const normalized = normalizeCommerceMessage(message);
  if (!normalized) return "empty message";

  const checks: [string, () => boolean][] = [
    ["CART_VIEW", () => isCartViewRequest(normalized)],
    ["RETURN_REQUEST", () => isReturnRequest(normalized)],
    ["REFUND_REQUEST", () => isRefundRequest(normalized)],
    ["COMPLAINT", () => isComplaintRequest(normalized)],
    ["SUPPORT", () => isSupportRequest(normalized)],
    ["TRACK_RETURN", () => isTrackReturnRequest(normalized)],
    ["TRACK_ORDER", () => isTrackOrderRequest(normalized)],
    ["PAYMENT_ISSUE", () => isPaymentIssueRequest(normalized)],
    ["CART_ADD", () => isCartAddRequest(normalized)],
    ["CART_REMOVE", () => isCartRemoveRequest(normalized)],
    ["CHECKOUT", () => isCheckoutRequest(normalized)],
    ["RETURN_POLICY", () => isReturnPolicyRequest(normalized)],
    ["REFUND_POLICY", () => isRefundPolicyRequest(normalized)],
    ["PRODUCT_CATALOG", () => isProductCatalogRequest(normalized)],
    ["PRODUCT_SEARCH", () => isProductSearchRequest(normalized)],
    ["RECOMMENDATION", () => isRecommendationRequest(normalized)],
  ];

  const nearMisses = checks
    .filter(([, test]) => {
      try {
        return test();
      } catch {
        return false;
      }
    })
    .map(([name]) => name);

  if (nearMisses.length > 0) {
    return `no priority match; partial signals: ${nearMisses.join(", ")}`;
  }

  return "no commerce keyword or pattern matched";
}

export function logCommerceIntent(input: {
  message: string;
  detectedIntent: string;
  matchedProduct?: string | null;
  actionExecuted?: string | null;
  fallbackReason?: string | null;
}): void {
  console.log("[INTENT]", {
    message: input.message,
    detectedIntent: input.detectedIntent,
    matchedProduct: input.matchedProduct ?? null,
    actionExecuted: input.actionExecuted ?? null,
    ...(input.fallbackReason ? { fallbackReason: input.fallbackReason } : {}),
  });
}

export function classifyCustomerIntent(message: string): CustomerMessageIntent {
  const probes = intentProbeTexts(message);
  if (probes.length === 0) return "OTHER";

  for (const probe of probes) {
    if (isPostOrderIssueRequest(probe)) {
      return "OTHER";
    }

    if (isCartViewRequest(probe)) {
      return "OTHER";
    }

    if (isCartRemoveRequest(probe)) {
      return "CART_REMOVE";
    }

    if (isCartAddRequest(probe)) {
      return "CART_ADD";
    }

    if (isProductCatalogRequest(probe)) {
      return "PRODUCT_DISCOVERY";
    }
  }

  const hasDiscovery = probes.some((candidate) =>
    DISCOVERY_PATTERNS.some((pattern) => pattern.test(candidate)),
  );
  const vagueOrder = probes.some((candidate) => isVagueOrderRequest(candidate));

  if (hasDiscovery || vagueOrder) {
    return "PRODUCT_DISCOVERY";
  }

  return "OTHER";
}

export function encodeRecommendationIntent(productIds: string[]): string {
  return `${RECOMMENDATION_INTENT_PREFIX}${productIds.join(",")}`;
}

export function parseRecommendationProductIds(intent: string | null): string[] {
  const resolvedIntent = resolveMessageIntent(intent);
  if (!resolvedIntent?.startsWith(RECOMMENDATION_INTENT_PREFIX)) return [];
  return resolvedIntent
    .slice(RECOMMENDATION_INTENT_PREFIX.length)
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

export type CartConfirmItem = {
  productId: string;
  quantity: number;
};

export function encodeCartConfirmIntent(items: CartConfirmItem[]): string {
  return `${CART_CONFIRM_INTENT_PREFIX}${items
    .map((item) => `${item.productId}:${item.quantity}`)
    .join(",")}`;
}

export function parseCartConfirmIntent(intent: string | null): CartConfirmItem[] {
  if (!intent?.startsWith(CART_CONFIRM_INTENT_PREFIX)) return [];
  return intent
    .slice(CART_CONFIRM_INTENT_PREFIX.length)
    .split(",")
    .map((segment) => {
      const [productId, quantityRaw] = segment.split(":");
      const quantity = Number.parseInt(quantityRaw ?? "1", 10);
      if (!productId || !Number.isFinite(quantity) || quantity <= 0) return null;
      return { productId, quantity };
    })
    .filter((item): item is CartConfirmItem => Boolean(item));
}

export function parseCartConfirmMessage(message: string): CartConfirmItem[] | null {
  const trimmed = message.trim();
  if (!trimmed.startsWith(CART_CONFIRM_REPLY_PREFIX)) return null;

  const payload = trimmed.slice(CART_CONFIRM_REPLY_PREFIX.length);
  return parseCartConfirmIntent(`${CART_CONFIRM_INTENT_PREFIX}${payload}`);
}

export function encodeCartPickIntent(productId: string): string {
  return `${CART_PICK_INTENT_PREFIX}${productId}`;
}

export function encodeCartClarifyIntent(
  candidates: { productId: string; label: string }[],
): string {
  return `${CART_CLARIFY_INTENT_PREFIX}${candidates
    .map((candidate) => `${candidate.productId}:${candidate.label}`)
    .join(",")}`;
}

export function parseCartClarifyIntent(intent: string | null): string[] {
  if (!intent?.startsWith(CART_CLARIFY_INTENT_PREFIX)) return [];
  return intent
    .slice(CART_CLARIFY_INTENT_PREFIX.length)
    .split(",")
    .map((segment) => segment.split(":")[0]?.trim())
    .filter(Boolean);
}

export function parseCartClarifyOptions(
  intent: string | null,
): { productId: string; label: string }[] {
  if (!intent?.startsWith(CART_CLARIFY_INTENT_PREFIX)) return [];
  return intent
    .slice(CART_CLARIFY_INTENT_PREFIX.length)
    .split(",")
    .map((segment) => {
      const [productId, ...labelParts] = segment.split(":");
      const label = labelParts.join(":").trim();
      if (!productId?.trim() || !label) return null;
      return { productId: productId.trim(), label };
    })
    .filter((option): option is { productId: string; label: string } => Boolean(option));
}

export function parseCartPickMessage(message: string): string | null {
  const trimmed = message.trim();
  if (!trimmed.startsWith(CART_PICK_INTENT_PREFIX)) return null;
  const productId = trimmed.slice(CART_PICK_INTENT_PREFIX.length).trim();
  return productId || null;
}
