import { classifyConversationFlow, type ConversationFlowIntent } from "@/lib/chat/conversation-flows";
import {
  classifyCustomerIntent,
  detectCommerceIntent,
  type CommerceIntentType,
  type CustomerMessageIntent,
} from "@/lib/ai/message-intent";
import { isQuickActionMessage, parseQuickAction } from "@/lib/chat/quick-actions";

export type AiRouteType =
  | "PRODUCT_CATALOG"
  | "PRODUCT_DISCOVERY"
  | "PRODUCT_RECOMMENDATION"
  | "CART_ADD"
  | "CART_REMOVE"
  | "ORDER_TRACKING"
  | "CART_VIEW"
  | "CHECKOUT"
  | "INVENTORY_LOOKUP"
  | "ORDER_RETURN"
  | "RETURN_TRACKING"
  | "SUPPORT"
  | "CONVERSATIONAL"
  | "GENERAL";

export type AiRouteDecision = {
  type: AiRouteType;
  requiresGroq: boolean;
  reason: string;
  conversationFlow: ReturnType<typeof classifyConversationFlow>;
  customerIntent: CustomerMessageIntent;
  commerceIntent: CommerceIntentType;
};

const CONVERSATIONAL_PATTERNS = [
  /\bwhat(?:'s| is)\s+(?:the\s+)?difference\b/i,
  /\bwhat(?:'s| is)\s+\w+/i,
  /\bhow (?:do|does|can|is)\b/i,
  /\btell me about\b/i,
  /\bexplain\b/i,
  /\bwhy (?:is|are|do|does)\b/i,
];

const POLICY_QUESTION_PATTERN =
  /\b(?:return|refund|exchange|warranty|guarantee)\s+policy\b/i;

function isConversationalQuery(message: string): boolean {
  if (detectCommerceIntent(message) !== "GENERAL_CHAT") return false;
  if (POLICY_QUESTION_PATTERN.test(message)) return false;
  return CONVERSATIONAL_PATTERNS.some((pattern) => pattern.test(message));
}

function resolveConversationFlow(
  message: string,
  commerceIntent: CommerceIntentType,
): ReturnType<typeof classifyConversationFlow> {
  const flow = classifyConversationFlow(message);
  if (flow) return flow;

  switch (commerceIntent) {
    case "CART_VIEW":
      return { type: "VIEW_CART" };
    case "CHECKOUT":
      return { type: "CHECKOUT" };
    case "TRACK_ORDER":
      return { type: "TRACK_ORDER" };
    case "TRACK_RETURN":
      return { type: "TRACK_RETURN" };
    default:
      return null;
  }
}

function resolveQuickActionRoute(message: string): AiRouteDecision | null {
  if (!isQuickActionMessage(message)) return null;

  const action = parseQuickAction(message);
  if (!action) return null;

  const base = {
    requiresGroq: false,
    customerIntent: "OTHER" as CustomerMessageIntent,
  };

  switch (action.type) {
    case "return_entire":
    case "return_item":
    case "return_select_item":
    case "return_skip_photo":
      return {
        ...base,
        type: "ORDER_RETURN",
        reason: "Return quick action",
        conversationFlow: null,
        commerceIntent: "RETURN_REQUEST",
      };
    case "contact_support":
    case "help":
    case "support_ticket":
      return {
        ...base,
        type: "SUPPORT",
        reason: "Support quick action",
        conversationFlow: { type: "CONTACT_SUPPORT" },
        commerceIntent: "SUPPORT",
      };
    case "track_order":
      return {
        ...base,
        type: "ORDER_TRACKING",
        reason: "Track order quick action",
        conversationFlow: { type: "TRACK_ORDER" },
        commerceIntent: "TRACK_ORDER",
      };
    case "track_return":
      return {
        ...base,
        type: "RETURN_TRACKING",
        reason: "Track return quick action",
        conversationFlow: {
          type: "TRACK_RETURN",
          returnRequestId: action.type === "track_return" ? action.requestId : undefined,
        },
        commerceIntent: "TRACK_RETURN",
      };
    case "refresh_status":
      return {
        ...base,
        type: "ORDER_TRACKING",
        reason: "Refresh status quick action",
        conversationFlow: { type: "REFRESH_STATUS" },
        commerceIntent: "TRACK_ORDER",
      };
    case "reorder":
      return {
        ...base,
        type: "CART_VIEW",
        reason: "Reorder quick action",
        conversationFlow: { type: "REORDER" },
        commerceIntent: "GENERAL_CHAT",
      };
    case "continue_shopping":
      return {
        ...base,
        type: "PRODUCT_DISCOVERY",
        reason: "Continue shopping quick action",
        conversationFlow: { type: "CONTINUE_SHOPPING" },
        commerceIntent: "GENERAL_CHAT",
      };
    case "view_cart":
      return {
        ...base,
        type: "CART_VIEW",
        reason: "View cart quick action",
        conversationFlow: { type: "VIEW_CART" },
        commerceIntent: "CART_VIEW",
      };
    case "browse_products":
      return {
        ...base,
        type: "PRODUCT_CATALOG",
        reason: "Browse products quick action",
        conversationFlow: { type: "BROWSE_PRODUCTS" },
        commerceIntent: "PRODUCT_CATALOG",
      };
    case "best_sellers":
      return {
        ...base,
        type: "INVENTORY_LOOKUP",
        reason: "Best sellers quick action",
        conversationFlow: null,
        commerceIntent: "PRODUCT_SEARCH",
      };
    default:
      return null;
  }
}

function mapConversationFlowToRoute(flow: ConversationFlowIntent): AiRouteType {
  switch (flow) {
    case "VIEW_CART":
    case "REORDER":
      return "CART_VIEW";
    case "TRACK_ORDER":
    case "REFRESH_STATUS":
    case "ORDER_HISTORY":
      return "ORDER_TRACKING";
    case "TRACK_RETURN":
      return "RETURN_TRACKING";
    case "CHECKOUT":
    case "PAY_NOW":
      return "CHECKOUT";
    case "CONTINUE_SHOPPING":
      return "PRODUCT_DISCOVERY";
    case "CONTACT_SUPPORT":
      return "SUPPORT";
    case "BROWSE_PRODUCTS":
      return "PRODUCT_CATALOG";
    case "CHANGE_QUANTITY":
      return "CART_ADD";
    default:
      return "GENERAL";
  }
}

function mapCommerceIntentToRoute(commerceIntent: CommerceIntentType): AiRouteType {
  switch (commerceIntent) {
    case "CART_VIEW":
      return "CART_VIEW";
    case "CART_ADD":
      return "CART_ADD";
    case "CART_REMOVE":
      return "CART_REMOVE";
    case "CHECKOUT":
      return "CHECKOUT";
    case "TRACK_ORDER":
      return "ORDER_TRACKING";
    case "TRACK_RETURN":
      return "RETURN_TRACKING";
    case "PRODUCT_CATALOG":
      return "PRODUCT_CATALOG";
    case "PRODUCT_SEARCH":
      return "INVENTORY_LOOKUP";
    case "RECOMMENDATION":
      return "PRODUCT_RECOMMENDATION";
    case "RETURN_REQUEST":
    case "REFUND_REQUEST":
    case "COMPLAINT":
      return "ORDER_RETURN";
    case "RETURN_POLICY":
    case "REFUND_POLICY":
    case "SUPPORT":
    case "PAYMENT_ISSUE":
      return "SUPPORT";
    case "GENERAL_CHAT":
      return "GENERAL";
  }
}

export function classifyAiRoute(message: string): AiRouteDecision {
  const trimmed = message.trim();

  const quickActionRoute = resolveQuickActionRoute(trimmed);
  if (quickActionRoute) return quickActionRoute;

  const commerceIntent = detectCommerceIntent(trimmed);
  const customerIntent = classifyCustomerIntent(trimmed);
  const conversationFlow = resolveConversationFlow(trimmed, commerceIntent);

  if (commerceIntent !== "GENERAL_CHAT") {
    const type = mapCommerceIntentToRoute(commerceIntent);
    return {
      type,
      requiresGroq: commerceIntent === "RECOMMENDATION",
      reason: `Commerce intent: ${commerceIntent}`,
      conversationFlow,
      customerIntent,
      commerceIntent,
    };
  }

  if (conversationFlow) {
    return {
      type: mapConversationFlowToRoute(conversationFlow.type),
      requiresGroq: false,
      reason: `Conversation flow: ${conversationFlow.type}`,
      conversationFlow,
      customerIntent,
      commerceIntent,
    };
  }

  if (isConversationalQuery(trimmed)) {
    return {
      type: "CONVERSATIONAL",
      requiresGroq: true,
      reason: "Conversational assistance",
      conversationFlow,
      customerIntent,
      commerceIntent,
    };
  }

  return {
    type: "GENERAL",
    requiresGroq: false,
    reason: "No commerce intent matched",
    conversationFlow,
    customerIntent,
    commerceIntent,
  };
}
