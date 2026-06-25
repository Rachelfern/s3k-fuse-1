import {
  getProductCatalogDisplay,
  getProductRecommendations,
  parseCustomerCart,
  parseCustomerCartRemove,
  type ParseCartResult,
  type RemoveCartResult,
} from "@/lib/ai/cart-service";
import {
  cartActionFromAddItem,
  cartActionFromRemoveItem,
  encodeCartActionIntent,
  formatCartActionContent,
} from "@/lib/chat/cart-action-messages";
import { CHAT_INTENTS } from "@/lib/chat/quick-replies";
import {
  parseReturnPhotoIntent,
  parseReturnReasonIntent,
  parseReturnRequestIdFromFlowIntent,
} from "@/lib/chat/return-intents";
import { classifyAiRoute, type AiRouteType } from "@/lib/ai/ai-router";
import {
  isTrackReturnRequest,
  parseTrackReturnRequestId,
} from "@/lib/ai/message-intent";
import { classifyChatIntentCategory } from "@/lib/ai/intent-categories";
import { updateConversationAiOps } from "@/lib/ai/conversation-insights";
import { generateReplyDraft, type GenerateDraftResult } from "@/lib/ai/draft-service";
import { NO_MATCHING_PRODUCTS_MESSAGE } from "@/lib/ai/groq-client";
import { detectCommerceIntent, explainIntentFallback, isExplicitProductLookup, isRecommendationRequest, logCommerceIntent } from "@/lib/ai/message-intent";
import { extractProductSearchQuery } from "@/lib/ai/product-query";
import { sanitizeAssistantResponse } from "@/lib/ai/response-validation";
import { handleConversationFlow } from "@/lib/chat/conversation-flows";
import { resolveQuickActionMessage } from "@/lib/chat/handle-quick-action";
import {
  adminMessageMatchesQuickAction,
  getQuickActionKey,
} from "@/lib/chat/quick-action-dedup";
import { encodeQuickActionIntent } from "@/lib/chat/quick-action-intent";
import { isQuickActionMessage } from "@/lib/chat/quick-actions";
import { getSupportPolicyMessage } from "@/lib/support/store-policies";
import { buildReturnRequestResponse } from "@/lib/orders/return-request-flow";
import { tryHandleCodRescheduleReply } from "@/lib/orders/cod-reschedule-flow";
import { DEFAULT_DELIVERY_FEE } from "@/lib/orders/create-order";
import { normalizeCommerceMessage } from "@/lib/hinglish";
import { diagnoseSupabaseError } from "@/lib/supabase/errors";
import { createServiceClient } from "@/lib/supabase/service-client";
import { NextResponse } from "next/server";

const ORDER_TRACKING_FLOWS = new Set(["TRACK_ORDER", "REFRESH_STATUS"]);

function buildSkippedQuickActionResponse(input: {
  intent: string;
  cartResult: ParseCartResult;
  flowCartSync: {
    product_id: string;
    name_en: string;
    quantity: number;
    price: number;
  }[] | null;
  recommendationSent: boolean;
  clarificationSent: boolean;
}) {
  return NextResponse.json({
    route: "QUICK_ACTION",
    requiresGroq: false,
    intent: input.intent,
    conversationFlow: null,
    draft: "",
    contextUsed: {},
    cart: input.cartResult,
    cartSync: input.flowCartSync,
    recommendationSent: input.recommendationSent,
    clarificationSent: input.clarificationSent,
    duplicateSkipped: true,
    assistantReplySent: false,
    orderPlaced: false,
    deliveryFee: DEFAULT_DELIVERY_FEE,
  });
}

async function sendGroqGeneralReply(input: {
  supabase: ReturnType<typeof createServiceClient>;
  conversationId: string;
  customerId: string;
  message: string;
  actionExecuted: string;
  fallbackReason?: string;
}): Promise<GenerateDraftResult> {
  const draftResult = await generateReplyDraft({
    supabase: input.supabase,
    conversationId: input.conversationId,
    customerMessage: input.message,
    customerId: input.customerId,
    useGroq: true,
  });

  const safeDraft = sanitizeAssistantResponse(draftResult.draft);
  const now = new Date().toISOString();

  const { error: replyError } = await input.supabase.from("messages").insert({
    conversation_id: input.conversationId,
    sender_type: "admin",
    content: safeDraft,
    was_ai_drafted: true,
    intent: "general_reply",
  });

  if (replyError) throw replyError;

  logCommerceIntent({
    message: input.message,
    detectedIntent: "GENERAL_CHAT",
    matchedProduct: null,
    actionExecuted: input.actionExecuted,
    fallbackReason: input.fallbackReason,
  });

  await input.supabase
    .from("conversations")
    .update({ last_message_at: now, unread_count: 1 })
    .eq("id", input.conversationId);

  return draftResult;
}

async function sendProductRecommendations(input: {
  supabase: ReturnType<typeof createServiceClient>;
  conversationId: string;
  message: string;
  allowGroq: boolean;
  actionExecuted: string;
  detectedIntent: string;
}): Promise<{ sent: boolean; recommendationSent: boolean }> {
  const now = new Date().toISOString();
  const recommendation = await getProductRecommendations({
    supabase: input.supabase,
    message: input.message,
    allowGroq: input.allowGroq,
  });

  if (!recommendation.success) {
    return { sent: false, recommendationSent: false };
  }

  const intro = sanitizeAssistantResponse(recommendation.intro);
  const footer = sanitizeAssistantResponse(recommendation.footer);
  const content = `${intro}\n\n${footer}`;

  const { error: recommendationError } = await input.supabase.from("messages").insert({
    conversation_id: input.conversationId,
    sender_type: "admin",
    content,
    intent: recommendation.intent,
    was_ai_drafted: input.allowGroq,
  });

  if (recommendationError) throw recommendationError;

  logCommerceIntent({
    message: input.message,
    detectedIntent: input.detectedIntent,
    matchedProduct: null,
    actionExecuted: input.actionExecuted,
  });

  await input.supabase
    .from("conversations")
    .update({ last_message_at: now, unread_count: 1 })
    .eq("id", input.conversationId);

  return { sent: true, recommendationSent: true };
}

function applyReturnTrackingContext(
  route: ReturnType<typeof classifyAiRoute>,
  message: string,
  recentIntent: string | null,
): ReturnType<typeof classifyAiRoute> {
  const returnContextRequestId = parseReturnRequestIdFromFlowIntent(recentIntent);
  const explicitReturnId = parseTrackReturnRequestId(message);

  if (
    isTrackReturnRequest(message) ||
    route.commerceIntent === "TRACK_RETURN" ||
    route.type === "RETURN_TRACKING"
  ) {
    return {
      ...route,
      type: "RETURN_TRACKING",
      commerceIntent: "TRACK_RETURN",
      conversationFlow: {
        type: "TRACK_RETURN",
        returnRequestId: explicitReturnId || returnContextRequestId || undefined,
      },
      reason: "Return tracking request",
      requiresGroq: false,
    };
  }

  if (
    returnContextRequestId &&
    route.conversationFlow?.type === "REFRESH_STATUS"
  ) {
    return {
      ...route,
      type: "RETURN_TRACKING",
      commerceIntent: "TRACK_RETURN",
      conversationFlow: {
        type: "TRACK_RETURN",
        returnRequestId: returnContextRequestId,
      },
      reason: "Refresh return status in return flow context",
      requiresGroq: false,
    };
  }

  return route;
}

const COMMERCE_ROUTE_TYPES = new Set<AiRouteType>([
  "CART_VIEW",
  "CART_ADD",
  "CART_REMOVE",
  "CHECKOUT",
  "ORDER_TRACKING",
  "RETURN_TRACKING",
  "INVENTORY_LOOKUP",
  "PRODUCT_CATALOG",
  "PRODUCT_RECOMMENDATION",
  "PRODUCT_DISCOVERY",
]);

async function broadcastPendingDraft(
  conversationId: string,
  payload: {
    draft: string;
    contextUsed: Record<string, unknown>;
    customerId: string;
  },
) {
  const supabase = createServiceClient();
  const channel = supabase.channel(`admin-ai:${conversationId}`);
  const timeoutMs = 5_000;

  await Promise.race([
    new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        void supabase.removeChannel(channel);
        reject(new Error("Pending draft broadcast timed out"));
      }, timeoutMs);

      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          void channel
            .send({
              type: "broadcast",
              event: "pending_draft",
              payload: {
                conversationId,
                ...payload,
              },
            })
            .finally(() => {
              clearTimeout(timeout);
              void supabase.removeChannel(channel);
              resolve();
            });
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          clearTimeout(timeout);
          void supabase.removeChannel(channel);
          reject(new Error(`Pending draft broadcast failed: ${status}`));
        }
      });
    }),
  ]);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      message?: string;
      conversationId?: string;
      conversation_id?: string;
      customerId?: string;
      customer_id?: string;
      localCartItems?: {
        productId: string;
        productName: string;
        quantity: number;
        unitPrice: number;
      }[];
    };

    const message = body.message?.trim();
    const conversationId = body.conversationId ?? body.conversation_id;
    const customerId = body.customerId ?? body.customer_id;

    if (!message) {
      return NextResponse.json({ error: "message is required" }, { status: 400 });
    }

    if (!conversationId || !customerId) {
      return NextResponse.json(
        { error: "conversationId and customerId are required" },
        { status: 400 },
      );
    }

    const normalizedMessage = normalizeCommerceMessage(message);
    const supabase = createServiceClient();
    const now = new Date().toISOString();

    console.log("[CHAT] /api/ai/process", {
      conversationId,
      customerId,
      message: normalizedMessage,
    });

    const { data: recentAdminMessage } = await supabase
      .from("messages")
      .select("intent")
      .eq("conversation_id", conversationId)
      .eq("sender_type", "admin")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const aiRoute = applyReturnTrackingContext(
      classifyAiRoute(message),
      normalizedMessage,
      recentAdminMessage?.intent ?? null,
    );
    const conversationFlow = aiRoute.conversationFlow;
    const intent = aiRoute.customerIntent;
    const intentCategory = classifyChatIntentCategory(message);

    let cartResult: ParseCartResult = { success: false, notAnOrder: true };
    let clarificationSent = false;
    let recommendationSent = false;
    let assistantReplySent = false;
    let draftResult: GenerateDraftResult | null = null;
    let flowCartSync: {
      product_id: string;
      name_en: string;
      quantity: number;
      price: number;
    }[] | null = null;

    const quickActionResult = await resolveQuickActionMessage({
      supabase,
      message,
      recentIntent: recentAdminMessage?.intent ?? null,
      customerId,
      conversationId,
    });

    const quickActionKey = getQuickActionKey(message);
    if (
      quickActionKey &&
      recentAdminMessage?.intent &&
      adminMessageMatchesQuickAction(
        {
          id: "latest-admin",
          conversation_id: conversationId,
          sender_type: "admin",
          content: "",
          intent: recentAdminMessage.intent,
          was_ai_drafted: false,
          created_at: now,
        },
        quickActionKey,
      )
    ) {
      console.log("[QUICK_ACTION]", {
        action: quickActionKey,
        duplicateSkipped: true,
        message,
      });

      return buildSkippedQuickActionResponse({
        intent,
        cartResult,
        flowCartSync,
        recommendationSent,
        clarificationSent,
      });
    }

    void updateConversationAiOps(supabase, {
      conversationId,
      customerId,
      latestMessage: message,
      escalationHints:
        quickActionResult.handled &&
        quickActionResult.actionExecuted === "support_ticket_created"
          ? {
              supportTicketCreated: true,
              supportTicketId: quickActionResult.supportTicketId,
            }
          : undefined,
    }).catch((analysisError) => {
      console.error("[AI_OPS] Conversation analysis failed:", analysisError);
    });

    if (quickActionResult.handled) {
      if (quickActionResult.delegateFlow) {
        const flowMessage = await handleConversationFlow({
          supabase,
          flow: quickActionResult.delegateFlow,
          customerId,
          conversationId,
          localCartItems: body.localCartItems,
        });

        if (flowMessage) {
          const taggedIntent =
            quickActionKey && flowMessage.intent
              ? encodeQuickActionIntent(quickActionKey, flowMessage.intent)
              : flowMessage.intent;

          const { error: flowError } = await supabase.from("messages").insert({
            conversation_id: conversationId,
            sender_type: flowMessage.sender_type,
            content: flowMessage.content,
            intent: taggedIntent,
            was_ai_drafted: flowMessage.was_ai_drafted,
          });

          if (flowError) throw flowError;

          if (flowMessage.cartSync?.length) {
            flowCartSync = flowMessage.cartSync.map((item) => ({
              product_id: item.product_id,
              name_en: item.name_en,
              quantity: item.quantity,
              price: item.price,
            }));
          }
        }
      } else if (quickActionResult.content) {
        const taggedIntent =
          quickActionKey && quickActionResult.intent
            ? encodeQuickActionIntent(quickActionKey, quickActionResult.intent)
            : quickActionResult.intent;

        const { error: quickError } = await supabase.from("messages").insert({
          conversation_id: conversationId,
          sender_type: "admin",
          content: quickActionResult.content,
          intent: taggedIntent,
          was_ai_drafted: false,
        });

        if (quickError) throw quickError;
      }

      assistantReplySent = true;

      logCommerceIntent({
        message: normalizedMessage,
        detectedIntent: "QUICK_ACTION",
        matchedProduct: null,
        actionExecuted: quickActionResult.actionExecuted,
      });

      console.log("[QUICK_ACTION]", {
        action: quickActionResult.actionExecuted,
        intent: quickActionResult.intent,
        message,
      });

      await supabase
        .from("conversations")
        .update({ last_message_at: now, unread_count: 1 })
        .eq("id", conversationId);
    } else if (quickActionResult.delegateMessage) {
      const delegatedRoute = classifyAiRoute(quickActionResult.delegateMessage);
      if (delegatedRoute.type === "INVENTORY_LOOKUP") {
        const recommendation = await getProductRecommendations({
          supabase,
          message: quickActionResult.delegateMessage,
          allowGroq: false,
        });

        if (recommendation.success) {
          const intro = sanitizeAssistantResponse(recommendation.intro);
          const footer = sanitizeAssistantResponse(recommendation.footer);
          const taggedIntent = encodeQuickActionIntent(
            quickActionKey ?? "best_sellers",
            recommendation.intent,
          );
          const { error: recommendationError } = await supabase.from("messages").insert({
            conversation_id: conversationId,
            sender_type: "admin",
            content: `${intro}\n\n${footer}`,
            intent: taggedIntent,
            was_ai_drafted: false,
          });

          if (recommendationError) throw recommendationError;
          recommendationSent = true;
          assistantReplySent = true;
        }

        await supabase
          .from("conversations")
          .update({ last_message_at: now, unread_count: 1 })
          .eq("id", conversationId);
      }
    }

    if (
      assistantReplySent &&
      (quickActionResult.handled || quickActionResult.delegateMessage)
    ) {
      return NextResponse.json({
        route: "QUICK_ACTION",
        requiresGroq: false,
        intent,
        conversationFlow: null,
        draft: "",
        contextUsed: {},
        cart: cartResult,
        cartSync: flowCartSync,
        recommendationSent,
        clarificationSent,
        assistantReplySent: true,
        orderPlaced: false,
        deliveryFee: DEFAULT_DELIVERY_FEE,
      });
    }

    if (!assistantReplySent) {
      const codReschedule = await tryHandleCodRescheduleReply({
        supabase,
        conversationId,
        customerId,
        message: normalizedMessage,
      });

      if (codReschedule.handled) {
        const { error: codError } = await supabase.from("messages").insert({
          conversation_id: conversationId,
          sender_type: "admin",
          content: codReschedule.content,
          intent: codReschedule.intent,
          was_ai_drafted: false,
        });

        if (codError) throw codError;

        void updateConversationAiOps(supabase, {
          conversationId,
          customerId,
          latestMessage: message,
          escalationHints: {
            supportTicketCreated: true,
            supportTicketId: codReschedule.ticketId,
          },
        }).catch((analysisError) => {
          console.error("[AI_OPS] COD reschedule analysis failed:", analysisError);
        });

        assistantReplySent = true;

        logCommerceIntent({
          message: normalizedMessage,
          detectedIntent: "GENERAL_CHAT",
          matchedProduct: null,
          actionExecuted: "cod_reschedule_ack",
        });

        await supabase
          .from("conversations")
          .update({ last_message_at: now, unread_count: 1 })
          .eq("id", conversationId);
      }
    }

    logCommerceIntent({
      message,
      detectedIntent: aiRoute.commerceIntent,
      matchedProduct: null,
      actionExecuted: null,
    });

    console.log("[AI_ROUTER]", {
      type: aiRoute.type,
      commerceIntent: aiRoute.commerceIntent,
      requiresGroq: aiRoute.requiresGroq,
      reason: aiRoute.reason,
      message,
      normalizedMessage,
    });

    console.log("[INTENT_CATEGORY]", {
      category: intentCategory,
      commerceIntent: aiRoute.commerceIntent,
      route: aiRoute.type,
      message,
    });

    if (
      recentAdminMessage?.intent === "checkout_address" &&
      normalizedMessage.length >= 10 &&
      !conversationFlow
    ) {
      const { error: addressError } = await supabase
        .from("customers")
        .update({ address: normalizedMessage })
        .eq("id", customerId);

      if (addressError) throw addressError;

      const checkoutMessage = await handleConversationFlow({
        supabase,
        flow: { type: "CHECKOUT" },
        customerId,
        conversationId,
        localCartItems: body.localCartItems,
      });

      if (checkoutMessage) {
        const { error: checkoutReplyError } = await supabase.from("messages").insert({
          conversation_id: conversationId,
          sender_type: checkoutMessage.sender_type,
          content: `Thanks! I've saved your delivery address.\n\n${checkoutMessage.content}`,
          intent: checkoutMessage.intent,
          was_ai_drafted: false,
        });

        if (checkoutReplyError) throw checkoutReplyError;

        await supabase
          .from("conversations")
          .update({ last_message_at: now, unread_count: 1 })
          .eq("id", conversationId);

        return NextResponse.json({
          route: aiRoute.type,
          intent: "CHECKOUT",
          conversationFlow: "CHECKOUT",
          draft: "",
          contextUsed: {},
          cart: cartResult,
          recommendationSent: false,
          clarificationSent: false,
          assistantReplySent: true,
          orderPlaced: false,
          deliveryFee: DEFAULT_DELIVERY_FEE,
        });
      }
    }

    if (aiRoute.type === "RETURN_TRACKING") {
      const returnFlow =
        aiRoute.conversationFlow?.type === "TRACK_RETURN"
          ? aiRoute.conversationFlow
          : {
              type: "TRACK_RETURN" as const,
              returnRequestId:
                parseTrackReturnRequestId(normalizedMessage) ||
                parseReturnRequestIdFromFlowIntent(recentAdminMessage?.intent ?? null) ||
                undefined,
            };

      const flowMessage = await handleConversationFlow({
        supabase,
        flow: returnFlow,
        customerId,
        conversationId,
        localCartItems: body.localCartItems,
      });

      if (flowMessage) {
        const { error: returnTrackError } = await supabase.from("messages").insert({
          conversation_id: conversationId,
          sender_type: flowMessage.sender_type,
          content: flowMessage.content,
          intent: flowMessage.intent,
          was_ai_drafted: false,
        });

        if (returnTrackError) throw returnTrackError;
      }

      assistantReplySent = true;

      logCommerceIntent({
        message: normalizedMessage,
        detectedIntent: "TRACK_RETURN",
        matchedProduct: null,
        actionExecuted: "return_tracking",
      });

      await supabase
        .from("conversations")
        .update({ last_message_at: now, unread_count: 1 })
        .eq("id", conversationId);
    } else if (aiRoute.type === "ORDER_RETURN") {
      const flowResult = await buildReturnRequestResponse({
        supabase,
        customerId,
        isRefund:
          aiRoute.commerceIntent === "REFUND_REQUEST" ||
          (aiRoute.commerceIntent === "COMPLAINT" &&
            /\brefund\b/i.test(normalizedMessage)),
      });

      const { error: returnError } = await supabase.from("messages").insert({
        conversation_id: conversationId,
        sender_type: "admin",
        content: flowResult.content,
        intent: flowResult.intent,
        was_ai_drafted: false,
      });

      if (returnError) throw returnError;

      assistantReplySent = true;

      logCommerceIntent({
        message: normalizedMessage,
        detectedIntent: aiRoute.commerceIntent,
        matchedProduct: null,
        actionExecuted: intentCategory ?? "return_flow",
      });

      await supabase
        .from("conversations")
        .update({ last_message_at: now, unread_count: 1 })
        .eq("id", conversationId);
    } else if (aiRoute.type === "SUPPORT") {
      const policyKind =
        aiRoute.commerceIntent === "RETURN_POLICY" ||
        intentCategory === "return_policy"
          ? "returnPolicy"
          : aiRoute.commerceIntent === "REFUND_POLICY" ||
              intentCategory === "refund_policy"
            ? "refundPolicy"
            : "generalSupport";

      const messageIntent =
        policyKind === "returnPolicy"
          ? CHAT_INTENTS.RETURN_POLICY
          : policyKind === "refundPolicy"
            ? CHAT_INTENTS.REFUND_POLICY
            : CHAT_INTENTS.SUPPORT;

      const { error: supportError } = await supabase.from("messages").insert({
        conversation_id: conversationId,
        sender_type: "admin",
        content: getSupportPolicyMessage(policyKind),
        intent: messageIntent,
        was_ai_drafted: false,
      });

      if (supportError) throw supportError;

      assistantReplySent = true;

      logCommerceIntent({
        message: normalizedMessage,
        detectedIntent: aiRoute.commerceIntent,
        matchedProduct: null,
        actionExecuted: intentCategory ?? policyKind,
      });

      await supabase
        .from("conversations")
        .update({ last_message_at: now, unread_count: 1 })
        .eq("id", conversationId);
    } else if (aiRoute.type === "PRODUCT_CATALOG") {
      const catalog = await getProductCatalogDisplay({ supabase });

      if (catalog.success) {
        const intro = sanitizeAssistantResponse(catalog.intro);
        const footer = sanitizeAssistantResponse(catalog.footer);
        const content = `${intro}\n\n${footer}`;

        const { error: catalogError } = await supabase.from("messages").insert({
          conversation_id: conversationId,
          sender_type: "admin",
          content,
          intent: catalog.intent,
          was_ai_drafted: false,
        });

        if (catalogError) throw catalogError;

        recommendationSent = true;
        assistantReplySent = true;

        logCommerceIntent({
          message: normalizedMessage,
          detectedIntent: "PRODUCT_CATALOG",
          matchedProduct: null,
          actionExecuted: "catalog",
        });

        await supabase
          .from("conversations")
          .update({ last_message_at: now, unread_count: 1 })
          .eq("id", conversationId);
      } else {
        const { error: catalogEmptyError } = await supabase.from("messages").insert({
          conversation_id: conversationId,
          sender_type: "admin",
          content: NO_MATCHING_PRODUCTS_MESSAGE,
          intent: CHAT_INTENTS.PRODUCT_SEARCH_EMPTY,
          was_ai_drafted: false,
        });

        if (catalogEmptyError) throw catalogEmptyError;

        assistantReplySent = true;

        logCommerceIntent({
          message: normalizedMessage,
          detectedIntent: "PRODUCT_CATALOG",
          matchedProduct: null,
          actionExecuted: "catalog_empty",
        });

        await supabase
          .from("conversations")
          .update({ last_message_at: now, unread_count: 1 })
          .eq("id", conversationId);
      }
    } else if (
      aiRoute.type === "ORDER_TRACKING" ||
      (conversationFlow &&
        ORDER_TRACKING_FLOWS.has(conversationFlow.type))
    ) {
      draftResult = await generateReplyDraft({
        supabase,
        conversationId,
        customerMessage: normalizedMessage,
        customerId,
        useGroq: true,
      });

      const safeDraft = sanitizeAssistantResponse(draftResult.draft);

      const { error: trackingError } = await supabase.from("messages").insert({
        conversation_id: conversationId,
        sender_type: "admin",
        content: safeDraft,
        was_ai_drafted: true,
        intent: CHAT_INTENTS.ORDER_STATUS,
      });

      if (trackingError) throw trackingError;

      assistantReplySent = true;

      logCommerceIntent({
        message: normalizedMessage,
        detectedIntent: "TRACK_ORDER",
        matchedProduct: null,
        actionExecuted: "groq_order_tracking",
      });

      await supabase
        .from("conversations")
        .update({ last_message_at: now, unread_count: 1 })
        .eq("id", conversationId);
    } else if (conversationFlow?.type === "PAY_NOW") {
      const flowMessage = await handleConversationFlow({
        supabase,
        flow: conversationFlow,
        customerId,
        conversationId,
        localCartItems: body.localCartItems,
      });

      if (flowMessage) {
        const { error: flowError } = await supabase.from("messages").insert({
          conversation_id: conversationId,
          sender_type: flowMessage.sender_type,
          content: flowMessage.content,
          intent: flowMessage.intent,
          was_ai_drafted: flowMessage.was_ai_drafted,
        });

        if (flowError) throw flowError;
        assistantReplySent = true;

        await supabase
          .from("conversations")
          .update({ last_message_at: now, unread_count: 1 })
          .eq("id", conversationId);
      }
    } else if (
      conversationFlow &&
      !ORDER_TRACKING_FLOWS.has(conversationFlow.type)
    ) {
      const flowMessage = await handleConversationFlow({
        supabase,
        flow: conversationFlow,
        customerId,
        conversationId,
        localCartItems: body.localCartItems,
      });

      if (flowMessage) {
        const { error: flowError } = await supabase.from("messages").insert({
          conversation_id: conversationId,
          sender_type: flowMessage.sender_type,
          content: flowMessage.content,
          intent: flowMessage.intent,
          was_ai_drafted: flowMessage.was_ai_drafted,
        });

        if (flowError) throw flowError;

        logCommerceIntent({
          message: normalizedMessage,
          detectedIntent: aiRoute.commerceIntent,
          matchedProduct: null,
          actionExecuted: conversationFlow.type.toLowerCase(),
        });

        if (flowMessage.cartSync?.length) {
          flowCartSync = flowMessage.cartSync.map((item) => ({
            product_id: item.product_id,
            name_en: item.name_en,
            quantity: item.quantity,
            price: item.price,
          }));
        }

        assistantReplySent = true;

        await supabase
          .from("conversations")
          .update({ last_message_at: now, unread_count: 1 })
          .eq("id", conversationId);
      }
    } else if (
      !assistantReplySent &&
      (aiRoute.type === "INVENTORY_LOOKUP" ||
        aiRoute.type === "PRODUCT_RECOMMENDATION")
    ) {
      const searchQuery = extractProductSearchQuery(normalizedMessage);

      console.log("[PRODUCT_SEARCH]", {
        detectedIntent: aiRoute.commerceIntent,
        extractedQuery: searchQuery,
        route: aiRoute.type,
        message: normalizedMessage,
      });

      const recommendation = await getProductRecommendations({
        supabase,
        message: normalizedMessage,
        allowGroq: aiRoute.requiresGroq,
      });

      if (recommendation.success) {
        const intro = sanitizeAssistantResponse(recommendation.intro);
        const footer = sanitizeAssistantResponse(recommendation.footer);
        const content = `${intro}\n\n${footer}`;

        const { error: recommendationError } = await supabase.from("messages").insert({
          conversation_id: conversationId,
          sender_type: "admin",
          content,
          intent: recommendation.intent,
          was_ai_drafted: aiRoute.requiresGroq,
        });

        if (recommendationError) throw recommendationError;

        recommendationSent = true;
        assistantReplySent = true;

        console.log("[PRODUCT_SEARCH]", {
          detectedIntent: aiRoute.commerceIntent,
          extractedQuery: searchQuery,
          productsReturned: recommendation.productIds.length,
          productIds: recommendation.productIds,
        });

        logCommerceIntent({
          message: normalizedMessage,
          detectedIntent: aiRoute.commerceIntent,
          matchedProduct: null,
          actionExecuted: "recommend",
        });

        await supabase
          .from("conversations")
          .update({ last_message_at: now, unread_count: 1 })
          .eq("id", conversationId);
      } else {
        if (isExplicitProductLookup(normalizedMessage)) {
          const { error: noResultsError } = await supabase.from("messages").insert({
            conversation_id: conversationId,
            sender_type: "admin",
            content: NO_MATCHING_PRODUCTS_MESSAGE,
            was_ai_drafted: false,
            intent: CHAT_INTENTS.PRODUCT_SEARCH_EMPTY,
          });

          if (noResultsError) throw noResultsError;

          assistantReplySent = true;

          console.log("[PRODUCT_SEARCH]", {
            detectedIntent: aiRoute.commerceIntent,
            extractedQuery: searchQuery,
            productsReturned: 0,
          });

          logCommerceIntent({
            message: normalizedMessage,
            detectedIntent: aiRoute.commerceIntent,
            matchedProduct: null,
            actionExecuted: "no_results",
          });

          await supabase
            .from("conversations")
            .update({ last_message_at: now, unread_count: 1 })
            .eq("id", conversationId);
        } else {
          draftResult = await sendGroqGeneralReply({
            supabase,
            conversationId,
            customerId,
            message: normalizedMessage,
            actionExecuted: "groq_discovery_fallback",
            fallbackReason: "recommendation_empty",
          });
          assistantReplySent = true;
        }
      }
    } else if (aiRoute.type === "CART_REMOVE") {
      const removeResult: RemoveCartResult = await parseCustomerCartRemove({
        supabase,
        message: normalizedMessage,
        customerId,
        conversationId,
      });

      if (removeResult.success) {
        const removeMessages = removeResult.removed.map((item) => {
          const payload = cartActionFromRemoveItem({
            productId: item.product_id,
            productName: item.name_en,
            removedQuantity: item.quantity_removed,
            unitPrice: item.price,
            cartTotal: removeResult.cartTotal,
          });

          return {
            conversation_id: conversationId,
            sender_type: "admin" as const,
            content: formatCartActionContent(payload),
            intent: encodeCartActionIntent(payload),
            was_ai_drafted: false,
          };
        });

        const { error: removeMessageError } = await supabase
          .from("messages")
          .insert(removeMessages);

        if (removeMessageError) throw removeMessageError;

        flowCartSync = removeResult.remaining.map((item) => ({
          product_id: item.product_id,
          name_en: item.name_en,
          quantity: item.quantity,
          price: item.price,
        }));

        logCommerceIntent({
          message: normalizedMessage,
          detectedIntent: "CART_REMOVE",
          matchedProduct: removeResult.removed.map((item) => item.name_en).join(", "),
          actionExecuted: "remove",
        });

        assistantReplySent = true;

        await supabase
          .from("conversations")
          .update({ last_message_at: now, unread_count: 1 })
          .eq("id", conversationId);
      } else if (
        "needsClarification" in removeResult &&
        removeResult.needsClarification
      ) {
        const { error: clarificationError } = await supabase.from("messages").insert({
          conversation_id: conversationId,
          sender_type: "admin",
          content: removeResult.message,
          was_ai_drafted: false,
          intent: removeResult.intent ?? "clarification",
        });

        if (clarificationError) throw clarificationError;

        logCommerceIntent({
          message: normalizedMessage,
          detectedIntent: "CART_REMOVE",
          matchedProduct: null,
          actionExecuted: "clarify",
        });

        await supabase
          .from("conversations")
          .update({ last_message_at: now, unread_count: 1 })
          .eq("id", conversationId);

        clarificationSent = true;
        assistantReplySent = true;
      }
    } else if (aiRoute.type === "CART_ADD") {
      cartResult = await parseCustomerCart({
        supabase,
        message: normalizedMessage,
        customerId,
        conversationId,
      });

      if (cartResult.success) {
        const successfulCart = cartResult;
        const cartActionMessages = successfulCart.items.map((item) => {
          const payload = cartActionFromAddItem({
            productId: item.product_id,
            productName: item.name_en,
            quantity: item.quantity,
            unitPrice: item.price,
            cartTotal: successfulCart.cartTotal,
          });

          return {
            conversation_id: conversationId,
            sender_type: "admin" as const,
            content: formatCartActionContent(payload),
            intent: encodeCartActionIntent(payload),
            was_ai_drafted: false,
          };
        });

        const { error: cartMessageError } = await supabase
          .from("messages")
          .insert(cartActionMessages);

        if (cartMessageError) throw cartMessageError;

        logCommerceIntent({
          message: normalizedMessage,
          detectedIntent: "CART_ADD",
          matchedProduct: cartResult.items.map((item) => item.name_en).join(", "),
          actionExecuted: "add",
        });

        assistantReplySent = true;

        await supabase
          .from("conversations")
          .update({ last_message_at: now, unread_count: 1 })
          .eq("id", conversationId);
      } else if ("needsClarification" in cartResult && cartResult.needsClarification) {
        const shouldTryRecommendation =
          cartResult.message === NO_MATCHING_PRODUCTS_MESSAGE &&
          isRecommendationRequest(normalizedMessage);

        if (shouldTryRecommendation) {
          const discovery = await sendProductRecommendations({
            supabase,
            conversationId,
            message: normalizedMessage,
            allowGroq: true,
            actionExecuted: "cart_recommendation_fallback",
            detectedIntent: "RECOMMENDATION",
          });

          if (discovery.sent) {
            recommendationSent = discovery.recommendationSent;
            assistantReplySent = true;
          } else {
            draftResult = await sendGroqGeneralReply({
              supabase,
              conversationId,
              customerId,
              message: normalizedMessage,
              actionExecuted: "groq_recommendation_fallback",
              fallbackReason: "cart_no_match_recommendation",
            });
            assistantReplySent = true;
          }
        } else {
          const { error: clarificationError } = await supabase.from("messages").insert({
            conversation_id: conversationId,
            sender_type: "admin",
            content: cartResult.message,
            was_ai_drafted: false,
            intent: cartResult.intent ?? "clarification",
          });

          if (clarificationError) throw clarificationError;

          await supabase
            .from("conversations")
            .update({ last_message_at: now, unread_count: 1 })
            .eq("id", conversationId);

          clarificationSent = true;
          assistantReplySent = true;
        }
      } else if (
        "needsConfirmation" in cartResult &&
        cartResult.needsConfirmation
      ) {
        const { error: confirmationError } = await supabase.from("messages").insert({
          conversation_id: conversationId,
          sender_type: "admin",
          content: cartResult.message,
          was_ai_drafted: false,
          intent: cartResult.intent,
        });

        if (confirmationError) throw confirmationError;

        await supabase
          .from("conversations")
          .update({ last_message_at: now, unread_count: 1 })
          .eq("id", conversationId);

        clarificationSent = true;
        assistantReplySent = true;
      } else if ("notAnOrder" in cartResult && cartResult.notAnOrder) {
        const discovery = await sendProductRecommendations({
          supabase,
          conversationId,
          message: normalizedMessage,
          allowGroq: true,
          actionExecuted: "cart_redirect_recommend",
          detectedIntent: "RECOMMENDATION",
        });

        if (discovery.sent) {
          recommendationSent = discovery.recommendationSent;
          assistantReplySent = true;
        } else {
          draftResult = await sendGroqGeneralReply({
            supabase,
            conversationId,
            customerId,
            message: normalizedMessage,
            actionExecuted: "groq_cart_redirect",
            fallbackReason: "cart_no_match",
          });
          assistantReplySent = true;
        }
      }
    }

    if (
      !assistantReplySent &&
      aiRoute.type === "CONVERSATIONAL"
    ) {
      draftResult = await generateReplyDraft({
        supabase,
        conversationId,
        customerMessage: normalizedMessage,
        customerId,
        useGroq: true,
      });

      const safeDraft = sanitizeAssistantResponse(draftResult.draft);

      const { error: replyError } = await supabase.from("messages").insert({
        conversation_id: conversationId,
        sender_type: "admin",
        content: safeDraft,
        was_ai_drafted: true,
        intent: "general_reply",
      });

      if (replyError) throw replyError;

      assistantReplySent = true;

      await supabase
        .from("conversations")
        .update({ last_message_at: now, unread_count: 1 })
        .eq("id", conversationId);
    }

    if (
      !assistantReplySent &&
      aiRoute.type === "GENERAL" &&
      aiRoute.commerceIntent === "GENERAL_CHAT" &&
      detectCommerceIntent(message) === "GENERAL_CHAT" &&
      !conversationFlow &&
      !isQuickActionMessage(message) &&
      !parseReturnReasonIntent(recentAdminMessage?.intent ?? null) &&
      !parseReturnPhotoIntent(recentAdminMessage?.intent ?? null)
    ) {
      draftResult = await generateReplyDraft({
        supabase,
        conversationId,
        customerMessage: normalizedMessage,
        customerId,
        useGroq: true,
      });

      const safeDraft = sanitizeAssistantResponse(draftResult.draft);

      const { error: replyError } = await supabase.from("messages").insert({
        conversation_id: conversationId,
        sender_type: "admin",
        content: safeDraft,
        was_ai_drafted: true,
        intent: "general_reply",
      });

      if (replyError) throw replyError;

      logCommerceIntent({
        message: normalizedMessage,
        detectedIntent: "GENERAL_CHAT",
        matchedProduct: null,
        actionExecuted: "groq_general_reply",
        fallbackReason: explainIntentFallback(message),
      });

      assistantReplySent = true;

      await supabase
        .from("conversations")
        .update({ last_message_at: now, unread_count: 1 })
        .eq("id", conversationId);
    }

    if (
      !assistantReplySent &&
      COMMERCE_ROUTE_TYPES.has(aiRoute.type)
    ) {
      console.warn("[INTENT] Commerce handler produced no reply:", {
        route: aiRoute.type,
        commerceIntent: aiRoute.commerceIntent,
        message: normalizedMessage,
      });
    }

    if (
      !assistantReplySent &&
      aiRoute.requiresGroq &&
      aiRoute.type === "PRODUCT_RECOMMENDATION"
    ) {
      if (isExplicitProductLookup(normalizedMessage)) {
        const { error: replyError } = await supabase.from("messages").insert({
          conversation_id: conversationId,
          sender_type: "admin",
          content: NO_MATCHING_PRODUCTS_MESSAGE,
          was_ai_drafted: false,
          intent: CHAT_INTENTS.PRODUCT_SEARCH_EMPTY,
        });

        if (replyError) throw replyError;
      } else {
        draftResult = await sendGroqGeneralReply({
          supabase,
          conversationId,
          customerId,
          message: normalizedMessage,
          actionExecuted: "groq_recommendation_fallback",
          fallbackReason: "recommendation_handler_miss",
        });
      }

      assistantReplySent = true;

      await supabase
        .from("conversations")
        .update({ last_message_at: now, unread_count: 1 })
        .eq("id", conversationId);
    }

    if (draftResult?.draft.trim()) {
      void broadcastPendingDraft(conversationId, {
        draft: draftResult.draft,
        contextUsed: draftResult.contextUsed,
        customerId,
      }).catch((broadcastError) => {
        console.error("[ERROR] Pending draft broadcast failed:", broadcastError);
      });
    }

    return NextResponse.json({
      route: aiRoute.type,
      requiresGroq: aiRoute.requiresGroq,
      intent,
      conversationFlow: conversationFlow?.type ?? null,
      draft: draftResult?.draft ?? "",
      contextUsed: draftResult?.contextUsed ?? {},
      cart: cartResult,
      cartSync: flowCartSync,
      recommendationSent,
      clarificationSent,
      assistantReplySent,
      orderPlaced: false,
      deliveryFee: DEFAULT_DELIVERY_FEE,
    });
  } catch (error) {
    console.error("[ERROR] AI process failed:", error);
    const detail = diagnoseSupabaseError(error);
    return NextResponse.json(
      {
        error:
          process.env.NODE_ENV === "development"
            ? detail
            : "Failed to process message",
      },
      { status: 500 },
    );
  }
}
