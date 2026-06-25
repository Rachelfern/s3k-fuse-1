import {
  parseReturnPhotoIntent,
  parseReturnReasonChoiceIntent,
  parseReturnReasonIntent,
  parseReturnItemPickIntent,
  parseReturnItemSelectIntent,
} from "@/lib/chat/return-intents";
import {
  type QuickAction,
  parseQuickAction,
} from "@/lib/chat/quick-actions";
import { classifyConversationFlow } from "@/lib/chat/conversation-flows";
import {
  buildReturnActionResponse,
  buildReturnItemSubmissionResponse,
  parseReturnItemFollowUp,
} from "@/lib/orders/return-request-flow";
import {
  buildReturnConfirmationMessage,
  buildReturnPhotoPrompt,
  buildReturnReasonChoiceMessage,
  buildReturnItemSelectionMessage,
  beginPartialItemSelection,
  continuePartialItemSelection,
  createReturnWithReason,
  fetchOrderForReturn,
  fetchOrderLineItemsWithIds,
  fetchReturnRequest,
  finalizeReturnRequest,
  startEntireOrderReturn,
  startPartialItemReturn,
  updateReturnRequestReason,
} from "@/lib/orders/return-request-service";
import {
  buildSupportTicketConfirmation,
  createSupportTicket,
} from "@/lib/support/support-ticket-service";
import { resolveMessageIntent } from "@/lib/chat/quick-action-intent";
import { CHAT_INTENTS } from "@/lib/chat/quick-replies";
import { getSupportPolicyMessage } from "@/lib/support/store-policies";
import { diagnoseSupabaseError, isReturnWorkflowSchemaError } from "@/lib/supabase/errors";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types";

export type QuickActionHandlerResult = {
  handled: true;
  content: string;
  intent: string;
  actionExecuted: string;
  supportTicketId?: string;
  delegateFlow?: ReturnType<typeof classifyConversationFlow>;
  delegateMessage?: string;
};

export type QuickActionHandlerResponse =
  | QuickActionHandlerResult
  | { handled: false; delegateMessage?: string };

function looksLikePhotoReference(message: string): boolean {
  const trimmed = message.trim();
  if (/^https?:\/\//i.test(trimmed)) return true;
  if (/^(skip|no photo|no image)/i.test(trimmed)) return false;
  return trimmed.length >= 8;
}

function legacySupportResponse(): QuickActionHandlerResult {
  return {
    handled: true,
    content: getSupportPolicyMessage("generalSupport"),
    intent: CHAT_INTENTS.SUPPORT,
    actionExecuted: "support_legacy",
  };
}

function legacyReturnSubmitted(itemLabel?: string): QuickActionHandlerResult {
  return {
    handled: true,
    content: itemLabel
      ? `Return request received for "${itemLabel}".\n\nOur team will review within 1 business day and message you here with pickup or refund next steps.`
      : `Return request received.\n\nOur team will review within 1 business day and message you here with pickup or refund next steps.`,
    intent: CHAT_INTENTS.RETURN_REQUEST_SUBMITTED,
    actionExecuted: "return_submitted_legacy",
  };
}

async function legacyEntireReturn(input: {
  supabase: SupabaseClient<Database>;
  customerId: string;
  orderId: string;
}): Promise<QuickActionHandlerResult> {
  const result = await buildReturnActionResponse({
    supabase: input.supabase,
    customerId: input.customerId,
    type: "entire",
    orderId: input.orderId,
  });
  return {
    handled: true,
    content: result.content,
    intent: result.intent,
    actionExecuted: "return_entire_legacy",
  };
}

async function legacyPartialReturn(input: {
  supabase: SupabaseClient<Database>;
  customerId: string;
  orderId: string;
  productId?: string;
  itemQuery?: string;
}): Promise<QuickActionHandlerResult> {
  let itemLabel = input.itemQuery?.trim() || "selected item";

  if (input.productId) {
    const order = await fetchOrderForReturn(
      input.supabase,
      input.customerId,
      input.orderId,
    );
    if (order?.cart_id) {
      const items = await fetchOrderLineItemsWithIds(input.supabase, order.cart_id);
      itemLabel =
        items.find((item) => item.product_id === input.productId)?.name ?? itemLabel;
    }
  }

  const result = buildReturnItemSubmissionResponse({
    orderId: input.orderId,
    itemQuery: itemLabel,
  });

  return {
    handled: true,
    content: result.content,
    intent: result.intent,
    actionExecuted: "return_partial_legacy",
  };
}

async function resolvePersistenceFallback(input: {
  supabase: SupabaseClient<Database>;
  message: string;
  recentIntent: string | null;
  customerId: string;
  conversationId: string;
}): Promise<QuickActionHandlerResponse> {
  const action = parseQuickAction(input.message);
  const itemSelect = parseReturnItemSelectIntent(input.recentIntent);

  if (action?.type === "return_entire") {
    return legacyEntireReturn({
      supabase: input.supabase,
      customerId: input.customerId,
      orderId: action.orderId,
    });
  }

  if (action?.type === "return_select_item") {
    return legacyPartialReturn({
      supabase: input.supabase,
      customerId: input.customerId,
      orderId: action.orderId,
      productId: action.productId,
    });
  }

  if (itemSelect) {
    const normalized = input.message.trim().toLowerCase();
    const matched = itemSelect.items.find(
      (item) =>
        item.label.toLowerCase().includes(normalized) ||
        normalized.includes(item.label.toLowerCase()),
    );
    if (matched) {
      return legacyPartialReturn({
        supabase: input.supabase,
        customerId: input.customerId,
        orderId: itemSelect.orderId,
        productId: matched.productId,
        itemQuery: matched.label,
      });
    }
  }

  const legacyItemFollowUp = parseReturnItemFollowUp(
    input.message,
    input.recentIntent,
  );
  if (legacyItemFollowUp) {
    const result = buildReturnItemSubmissionResponse(legacyItemFollowUp);
    return {
      handled: true,
      content: result.content,
      intent: result.intent,
      actionExecuted: "return_item_submitted",
    };
  }

  if (
    action?.type === "support_ticket" ||
    action?.type === "contact_support" ||
    action?.type === "help"
  ) {
    return legacySupportResponse();
  }

  if (
    parseReturnReasonIntent(input.recentIntent) ||
    parseReturnPhotoIntent(input.recentIntent)
  ) {
    return legacyReturnSubmitted();
  }

  if (action?.type === "return_item") {
    const result = await buildReturnItemSelectionMessage({
      supabase: input.supabase,
      orderId: action.orderId,
      customerId: input.customerId,
    });
    if (result) {
      return {
        handled: true,
        content: result.content,
        intent: result.intent,
        actionExecuted: "return_item_select",
      };
    }
  }

  return legacyReturnSubmitted();
}

export async function handlePendingReturnStep(input: {
  supabase: SupabaseClient<Database>;
  message: string;
  recentIntent: string | null;
  customerId: string;
  conversationId: string;
}): Promise<QuickActionHandlerResponse> {
  const recentIntent =
    resolveMessageIntent(input.recentIntent) ?? input.recentIntent;

  const reasonChoice = parseReturnReasonChoiceIntent(recentIntent);
  if (reasonChoice) {
    if (parseQuickAction(input.message)) {
      return { handled: false };
    }

    const reason = input.message.trim();
    if (reason.length < 3) {
      return {
        handled: true,
        content: "Please provide a brief reason for your return (at least a few words).",
        intent: recentIntent ?? "return_reason_choice",
        actionExecuted: "return_reason_invalid",
      };
    }

    const result = await createReturnWithReason({
      supabase: input.supabase,
      orderId: reasonChoice.orderId,
      customerId: input.customerId,
      conversationId: input.conversationId,
      mode: reasonChoice.mode,
      productIds: reasonChoice.productIds,
      reason,
    });

    return {
      handled: true,
      content: result.content,
      intent: result.intent,
      actionExecuted: "return_created_with_reason",
    };
  }

  const reasonRequestId = parseReturnReasonIntent(recentIntent);
  if (reasonRequestId) {
    if (parseQuickAction(input.message)) {
      return { handled: false };
    }

    const reason = input.message.trim();
    if (reason.length < 3) {
      return {
        handled: true,
        content: "Please provide a brief reason for your return (at least a few words).",
        intent: recentIntent ?? "return_reason",
        actionExecuted: "return_reason_invalid",
      };
    }

    const request = await fetchReturnRequest(
      input.supabase,
      reasonRequestId,
      input.customerId,
    );
    if (!request) {
      return {
        handled: true,
        content: "That return request expired. Please start a new return from your order.",
        intent: "return_request",
        actionExecuted: "return_request_not_found",
      };
    }

    await updateReturnRequestReason({
      supabase: input.supabase,
      requestId: reasonRequestId,
      reason,
    });

    const photoPrompt = buildReturnPhotoPrompt(reasonRequestId);
    return {
      handled: true,
      content: photoPrompt.content,
      intent: photoPrompt.intent,
      actionExecuted: "return_reason_captured",
    };
  }

  const photoRequestId = parseReturnPhotoIntent(recentIntent);
  if (photoRequestId) {
    const incomingAction = parseQuickAction(input.message);
    if (incomingAction && incomingAction.type !== "return_skip_photo") {
      return { handled: false };
    }

    const skipAction = incomingAction;
    if (skipAction?.type === "return_skip_photo" && skipAction.requestId === photoRequestId) {
      const finalized = await finalizeReturnRequest({
        supabase: input.supabase,
        requestId: photoRequestId,
        photoUrl: null,
      });
      const confirmation = buildReturnConfirmationMessage(finalized);
      return {
        handled: true,
        content: confirmation.content,
        intent: confirmation.intent,
        actionExecuted: "return_submitted",
      };
    }

    const photoUrl = looksLikePhotoReference(input.message) ? input.message.trim() : null;
    const finalized = await finalizeReturnRequest({
      supabase: input.supabase,
      requestId: photoRequestId,
      photoUrl,
    });
    const confirmation = buildReturnConfirmationMessage(finalized);
    return {
      handled: true,
      content: confirmation.content,
      intent: confirmation.intent,
      actionExecuted: "return_submitted",
    };
  }

  const itemPick = parseReturnItemPickIntent(recentIntent);
  if (itemPick) {
    const toggleAction = parseQuickAction(input.message);
    if (
      toggleAction?.type === "return_toggle_item" &&
      toggleAction.orderId === itemPick.orderId
    ) {
      const selected = new Set(itemPick.selectedProductIds);
      if (selected.has(toggleAction.productId)) {
        selected.delete(toggleAction.productId);
      } else {
        selected.add(toggleAction.productId);
      }

      const result = await buildReturnItemSelectionMessage({
        supabase: input.supabase,
        orderId: itemPick.orderId,
        customerId: input.customerId,
        selectedProductIds: [...selected],
      });

      if (result) {
        return {
          handled: true,
          content: result.content,
          intent: result.intent,
          actionExecuted: "return_item_toggled",
        };
      }
    }

    if (
      toggleAction?.type === "return_continue_items" &&
      toggleAction.orderId === itemPick.orderId
    ) {
      const result = await continuePartialItemSelection({
        supabase: input.supabase,
        orderId: itemPick.orderId,
        customerId: input.customerId,
        productIds: toggleAction.productIds.length
          ? toggleAction.productIds
          : itemPick.selectedProductIds,
      });
      return {
        handled: true,
        content: result.content,
        intent: result.intent,
        actionExecuted: "return_items_selected",
      };
    }
  }

  const itemSelect = parseReturnItemSelectIntent(recentIntent);
  if (itemSelect) {
    const normalized = input.message.trim().toLowerCase();
    const matched = itemSelect.items.find(
      (item) =>
        item.label.toLowerCase().includes(normalized) ||
        normalized.includes(item.label.toLowerCase()) ||
        new RegExp(
          `return\\s+(?:the\\s+)?${item.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
          "i",
        ).test(input.message),
    );

    if (matched) {
      const result = await startPartialItemReturn({
        supabase: input.supabase,
        orderId: itemSelect.orderId,
        productId: matched.productId,
        customerId: input.customerId,
        conversationId: input.conversationId,
      });
      return {
        handled: true,
        content: result.content,
        intent: result.intent,
        actionExecuted: "return_partial_started",
      };
    }
  }

  const legacyItemFollowUp = parseReturnItemFollowUp(
    input.message,
    recentIntent,
  );
  if (legacyItemFollowUp) {
    return {
      handled: true,
      content: `Return request received for "${legacyItemFollowUp.itemQuery}".

Our team will review within 1 business day and message you here with pickup or refund next steps.`,
      intent: "return_request_submitted",
      actionExecuted: "return_item_submitted",
    };
  }

  return { handled: false };
}

async function handleSupportTicket(input: {
  supabase: SupabaseClient<Database>;
  conversationId: string;
  customerId: string;
  orderId?: string;
}): Promise<QuickActionHandlerResult> {
  const ticket = await createSupportTicket({
    supabase: input.supabase,
    conversationId: input.conversationId,
    customerId: input.customerId,
    orderId: input.orderId,
  });

  const confirmation = buildSupportTicketConfirmation(ticket);
  return {
    handled: true,
    content: confirmation.content,
    intent: confirmation.intent,
    actionExecuted: "support_ticket_created",
    supportTicketId: ticket.id,
  };
}

export async function handleQuickAction(input: {
  supabase: SupabaseClient<Database>;
  action: QuickAction;
  customerId: string;
  conversationId: string;
}): Promise<QuickActionHandlerResponse> {
  const { supabase, action, customerId, conversationId } = input;

  switch (action.type) {
    case "return_entire": {
      const result = await startEntireOrderReturn({
        supabase,
        orderId: action.orderId,
        customerId,
        conversationId,
      });
      return {
        handled: true,
        content: result.content,
        intent: result.intent,
        actionExecuted: "return_entire_started",
      };
    }

    case "return_item": {
      const result = await beginPartialItemSelection({
        supabase,
        orderId: action.orderId,
        customerId,
      });
      return {
        handled: true,
        content: result.content,
        intent: result.intent,
        actionExecuted: "return_item_select",
      };
    }

    case "return_toggle_item": {
      const selected = new Set(action.selectedProductIds);
      if (selected.has(action.productId)) {
        selected.delete(action.productId);
      } else {
        selected.add(action.productId);
      }

      const result = await buildReturnItemSelectionMessage({
        supabase,
        orderId: action.orderId,
        customerId,
        selectedProductIds: [...selected],
      });
      if (!result) {
        return {
          handled: true,
          content: "I couldn't find that order. Please try again or contact support.",
          intent: "return_request",
          actionExecuted: "return_item_order_not_found",
        };
      }
      return {
        handled: true,
        content: result.content,
        intent: result.intent,
        actionExecuted: "return_item_toggled",
      };
    }

    case "return_continue_items": {
      const result = await continuePartialItemSelection({
        supabase,
        orderId: action.orderId,
        customerId,
        productIds: action.productIds,
      });
      return {
        handled: true,
        content: result.content,
        intent: result.intent,
        actionExecuted: "return_items_selected",
      };
    }

    case "return_set_reason": {
      if (action.reason === "Other") {
        const result = buildReturnReasonChoiceMessage({
          orderId: action.orderId,
          mode: action.mode,
          productIds: action.productIds,
        });
        return {
          handled: true,
          content: `${result.content}\n\nPlease type your reason:`,
          intent: result.intent,
          actionExecuted: "return_reason_other",
        };
      }

      const result = await createReturnWithReason({
        supabase,
        orderId: action.orderId,
        customerId,
        conversationId,
        mode: action.mode,
        productIds: action.productIds,
        reason: action.reason,
      });
      return {
        handled: true,
        content: result.content,
        intent: result.intent,
        actionExecuted: "return_created_with_reason",
      };
    }

    case "return_select_item": {
      const result = await startPartialItemReturn({
        supabase,
        orderId: action.orderId,
        productId: action.productId,
        customerId,
        conversationId,
      });
      return {
        handled: true,
        content: result.content,
        intent: result.intent,
        actionExecuted: "return_partial_started",
      };
    }

    case "return_skip_photo": {
      const request = await fetchReturnRequest(
        supabase,
        action.requestId,
        customerId,
      );
      if (!request) {
        return {
          handled: true,
          content: "That return request expired. Please start a new return.",
          intent: "return_request",
          actionExecuted: "return_request_not_found",
        };
      }

      const finalized = await finalizeReturnRequest({
        supabase,
        requestId: action.requestId,
        photoUrl: null,
      });
      const confirmation = buildReturnConfirmationMessage(finalized);
      return {
        handled: true,
        content: confirmation.content,
        intent: confirmation.intent,
        actionExecuted: "return_submitted",
      };
    }

    case "support_ticket":
    case "contact_support":
    case "help":
      return handleSupportTicket({
        supabase,
        conversationId,
        customerId,
        orderId: action.type === "support_ticket" ? action.orderId : undefined,
      });

    case "track_return":
      return {
        handled: true,
        delegateFlow: {
          type: "TRACK_RETURN",
          returnRequestId: action.requestId,
        },
        content: "",
        intent: action.requestId
          ? `return_tracking|${action.requestId}`
          : "return_tracking",
        actionExecuted: "track_return",
      };

    case "track_order":
    case "refresh_status":
      return { handled: false };

    case "reorder":
      return {
        handled: true,
        delegateFlow: { type: "REORDER" },
        content: "",
        intent: "cart_updated",
        actionExecuted: "reorder",
      };

    case "continue_shopping":
      return {
        handled: true,
        delegateFlow: { type: "CONTINUE_SHOPPING" },
        content: "",
        intent: "continue_shopping",
        actionExecuted: "continue_shopping",
      };

    case "view_cart":
      return {
        handled: true,
        delegateFlow: { type: "VIEW_CART" },
        content: "",
        intent: "cart_view",
        actionExecuted: "view_cart",
      };

    case "browse_products":
      return {
        handled: true,
        delegateFlow: { type: "BROWSE_PRODUCTS" },
        content: "",
        intent: "browse_products",
        actionExecuted: "browse_products",
      };

    case "best_sellers":
      return {
        handled: false,
        delegateMessage: "Best Sellers",
      };

    default:
      return { handled: false };
  }
}

export async function resolveQuickActionMessage(input: {
  supabase: SupabaseClient<Database>;
  message: string;
  recentIntent: string | null;
  customerId: string;
  conversationId: string;
}): Promise<QuickActionHandlerResponse> {
  try {
    const pending = await handlePendingReturnStep({
      supabase: input.supabase,
      message: input.message,
      recentIntent: input.recentIntent,
      customerId: input.customerId,
      conversationId: input.conversationId,
    });
    if (pending.handled) return pending;

    const action = parseQuickAction(input.message);
    if (!action) return { handled: false };

    return handleQuickAction({
      supabase: input.supabase,
      action,
      customerId: input.customerId,
      conversationId: input.conversationId,
    });
  } catch (error) {
    if (!isReturnWorkflowSchemaError(error)) throw error;

    console.warn(
      "[QUICK_ACTION] return persistence unavailable — using chat-only fallback",
      { message: input.message, error: diagnoseSupabaseError(error) },
    );

    return resolvePersistenceFallback(input);
  }
}
