import {
  encodeReturnConfirmedIntent,
  encodeReturnPhotoIntent,
  encodeReturnReasonChoiceIntent,
  encodeReturnReasonIntent,
  encodeReturnItemPickIntent,
  type ReturnItemOption,
} from "@/lib/chat/return-intents";
import { formatOrderRef } from "@/lib/orders/return-request-flow";
import {
  isCheckConstraintError,
  isMissingColumnError,
} from "@/lib/supabase/errors";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types";

export type ReturnRequestStatus =
  | "awaiting_reason"
  | "awaiting_photo"
  | "pending"
  | "approved"
  | "rejected"
  | "pickup_scheduled"
  | "picked_up"
  | "refunded";

export type ReturnRequestRow = {
  id: string;
  order_id: string;
  customer_id: string;
  conversation_id: string | null;
  request_type: "entire" | "partial";
  status: ReturnRequestStatus;
  reason: string | null;
  photo_url: string | null;
};

export type ReturnFlowMessage = {
  content: string;
  intent: string;
};

export type OrderLineItem = {
  product_id: string;
  name: string;
  quantity: number;
  lineTotal: number;
};

function formatCurrency(amount: number): string {
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

export async function fetchOrderForReturn(
  supabase: SupabaseClient<Database>,
  customerId: string,
  orderId: string,
) {
  const { data, error } = await supabase
    .from("orders")
    .select("id, customer_id, cart_id, status, total_amount, delivery_fee")
    .eq("id", orderId)
    .eq("customer_id", customerId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function fetchOrderLineItemsWithIds(
  supabase: SupabaseClient<Database>,
  cartId: string | null,
): Promise<OrderLineItem[]> {
  if (!cartId) return [];

  const { data, error } = await supabase
    .from("cart_items")
    .select("product_id, quantity, price_snapshot, products ( name_en )")
    .eq("cart_id", cartId);

  if (error) throw error;

  return (data ?? [])
    .filter((row) => row.product_id)
    .map((row) => ({
      product_id: row.product_id as string,
      name: (row.products as { name_en: string } | null)?.name_en ?? "Item",
      quantity: row.quantity,
      lineTotal: row.quantity * Number(row.price_snapshot),
    }));
}

export async function createReturnRequest(input: {
  supabase: SupabaseClient<Database>;
  orderId: string;
  customerId: string;
  conversationId: string;
  requestType: "entire" | "partial";
  items?: { productId: string; productName: string; quantity: number }[];
}): Promise<ReturnRequestRow> {
  const { data, error } = await input.supabase
    .from("return_requests")
    .insert({
      order_id: input.orderId,
      customer_id: input.customerId,
      conversation_id: input.conversationId,
      request_type: input.requestType,
      status: "awaiting_reason",
    })
    .select("*")
    .single();

  if (error) throw error;

  if (input.items?.length) {
    const { error: itemsError } = await input.supabase
      .from("return_request_items")
      .insert(
        input.items.map((item) => ({
          return_request_id: data.id,
          product_id: item.productId,
          product_name: item.productName,
          quantity: item.quantity,
        })),
      );

    if (itemsError) throw itemsError;
  }

  return data as ReturnRequestRow;
}

export async function fetchReturnRequest(
  supabase: SupabaseClient<Database>,
  requestId: string,
  customerId: string,
): Promise<ReturnRequestRow | null> {
  const { data, error } = await supabase
    .from("return_requests")
    .select("*")
    .eq("id", requestId)
    .eq("customer_id", customerId)
    .maybeSingle();

  if (error) throw error;
  return (data as ReturnRequestRow | null) ?? null;
}

export async function updateReturnRequestReason(input: {
  supabase: SupabaseClient<Database>;
  requestId: string;
  reason: string;
}): Promise<void> {
  const { error } = await input.supabase
    .from("return_requests")
    .update({
      reason: input.reason.trim(),
      status: "awaiting_photo",
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.requestId);

  if (error) throw error;
}

async function populateReturnCustomerFields(
  supabase: SupabaseClient<Database>,
  requestId: string,
): Promise<void> {
  const { data: request, error: requestError } = await supabase
    .from("return_requests")
    .select("order_id, customer_id, conversation_id")
    .eq("id", requestId)
    .maybeSingle();

  if (requestError) throw requestError;
  if (!request) return;

  const [{ data: order }, { data: customer }] = await Promise.all([
    supabase
      .from("orders")
      .select("delivery_address")
      .eq("id", request.order_id)
      .maybeSingle(),
    supabase
      .from("customers")
      .select("name, phone, address")
      .eq("id", request.customer_id)
      .maybeSingle(),
  ]);

  const pickupAddress =
    order?.delivery_address?.trim() ||
    customer?.address?.trim() ||
    null;

  const { error: updateError } = await supabase
    .from("return_requests")
    .update({
      customer_name: customer?.name?.trim() || null,
      phone: customer?.phone?.trim() || null,
      pickup_address: pickupAddress,
    })
    .eq("id", requestId);

  if (
    updateError &&
    !isMissingColumnError(updateError, "customer_name") &&
    !isMissingColumnError(updateError, "pickup_address") &&
    !isMissingColumnError(updateError, "phone")
  ) {
    throw updateError;
  }

  if (request.conversation_id) {
    const { error: convError } = await supabase
      .from("conversations")
      .update({ needs_human_assistance: true })
      .eq("id", request.conversation_id);

    if (convError && !isMissingColumnError(convError, "needs_human_assistance")) {
      console.warn("[RETURN] Failed to flag conversation for human assistance:", convError);
    }
  }
}

export async function finalizeReturnRequest(input: {
  supabase: SupabaseClient<Database>;
  requestId: string;
  photoUrl?: string | null;
}): Promise<ReturnRequestRow> {
  await populateReturnCustomerFields(input.supabase, input.requestId);

  const updatePayload = {
    photo_url: input.photoUrl?.trim() || null,
    updated_at: new Date().toISOString(),
  };

  const statusCandidates: ReturnRequestStatus[] = ["pending"];

  // Legacy schema before return-management migration.
  const legacyStatus = "pending_review" as ReturnRequestStatus;
  const candidates = [...statusCandidates, legacyStatus];
  let lastError: unknown = null;

  for (const status of candidates) {
    const { data, error } = await input.supabase
      .from("return_requests")
      .update({ ...updatePayload, status })
      .eq("id", input.requestId)
      .select("*")
      .single();

    if (!error) return data as ReturnRequestRow;

    if (isCheckConstraintError(error, "return_requests_status_check")) {
      lastError = error;
      continue;
    }

    throw error;
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Failed to finalize return request.");
}

export function buildReturnReasonPrompt(requestId: string): ReturnFlowMessage {
  return {
    content:
      "Please tell us why you'd like to return this order (e.g. damaged item, wrong product, quality issue).",
    intent: encodeReturnReasonIntent(requestId),
  };
}

export function buildReturnReasonChoiceMessage(input: {
  orderId: string;
  mode: "entire" | "partial";
  productIds?: string[];
  itemLabels?: string[];
}): ReturnFlowMessage {
  return {
    content: `Reason for return:${input.mode === "partial" && input.itemLabels?.length ? `\n${input.itemLabels.map((label) => `• ${label}`).join("\n")}` : ""}`,
    intent: encodeReturnReasonChoiceIntent({
      orderId: input.orderId,
      mode: input.mode,
      productIds: input.productIds,
    }),
  };
}

export function buildReturnPhotoPrompt(requestId: string): ReturnFlowMessage {
  return {
    content:
      "If you have a photo of the issue, reply with a link or brief description.\n\nYou can also tap Skip Photo Upload to continue without a photo.",
    intent: encodeReturnPhotoIntent(requestId),
  };
}

export function buildReturnConfirmationMessage(request: ReturnRequestRow): ReturnFlowMessage {
  const orderRef = formatOrderRef(request.order_id);
  const typeLabel = request.request_type === "entire" ? "Full order" : "Partial return";

  return {
    content: `Return Request Created

Request ID: ${request.id}
Order: #${orderRef}
Type: ${typeLabel}
Status: Pending

Our team will review your request and message you here within 1 business day.`,
    intent: encodeReturnConfirmedIntent(request.id),
  };
}

export async function buildReturnItemSelectionMessage(input: {
  supabase: SupabaseClient<Database>;
  orderId: string;
  customerId: string;
  selectedProductIds?: string[];
}): Promise<ReturnFlowMessage | null> {
  const order = await fetchOrderForReturn(
    input.supabase,
    input.customerId,
    input.orderId,
  );
  if (!order) return null;

  const lineItems = await fetchOrderLineItemsWithIds(input.supabase, order.cart_id);
  if (lineItems.length === 0) {
    return {
      content:
        "I couldn't load items for this order. Please contact support for help.",
      intent: "return_request",
    };
  }

  const orderRef = formatOrderRef(order.id);
  const selectedProductIds = input.selectedProductIds ?? [];
  const itemOptions: ReturnItemOption[] = lineItems.map((item) => ({
    productId: item.product_id,
    label: item.name,
  }));

  const selectedLines = lineItems
    .filter((item) => selectedProductIds.includes(item.product_id))
    .map((item) => `• ${item.name} × ${item.quantity}`);

  const selectionSummary =
    selectedLines.length > 0
      ? `\n\nSelected:\n${selectedLines.join("\n")}`
      : "\n\nTap items below to select them.";

  return {
    content: `Select item(s) to return from Order #${orderRef}:${selectionSummary}`,
    intent: encodeReturnItemPickIntent({
      orderId: order.id,
      items: itemOptions,
      selectedProductIds,
    }),
  };
}

export async function startEntireOrderReturn(input: {
  supabase: SupabaseClient<Database>;
  orderId: string;
  customerId: string;
  conversationId: string;
}): Promise<ReturnFlowMessage> {
  const order = await fetchOrderForReturn(
    input.supabase,
    input.customerId,
    input.orderId,
  );
  if (!order) {
    return {
      content: "I couldn't find that order. Please try again or contact support.",
      intent: "return_request",
    };
  }

  return buildReturnReasonChoiceMessage({
    orderId: order.id,
    mode: "entire",
  });
}

export async function beginPartialItemSelection(input: {
  supabase: SupabaseClient<Database>;
  orderId: string;
  customerId: string;
}): Promise<ReturnFlowMessage> {
  const result = await buildReturnItemSelectionMessage({
    supabase: input.supabase,
    orderId: input.orderId,
    customerId: input.customerId,
    selectedProductIds: [],
  });

  return (
    result ?? {
      content: "I couldn't find that order. Please try again or contact support.",
      intent: "return_request",
    }
  );
}

export async function continuePartialItemSelection(input: {
  supabase: SupabaseClient<Database>;
  orderId: string;
  customerId: string;
  productIds: string[];
}): Promise<ReturnFlowMessage> {
  if (input.productIds.length === 0) {
    const pickMessage = await buildReturnItemSelectionMessage({
      supabase: input.supabase,
      orderId: input.orderId,
      customerId: input.customerId,
      selectedProductIds: [],
    });
    return (
      pickMessage ?? {
        content: "Please select at least one item to return.",
        intent: "return_request",
      }
    );
  }

  const order = await fetchOrderForReturn(
    input.supabase,
    input.customerId,
    input.orderId,
  );
  if (!order) {
    return {
      content: "I couldn't find that order. Please try again or contact support.",
      intent: "return_request",
    };
  }

  const lineItems = await fetchOrderLineItemsWithIds(input.supabase, order.cart_id);
  const selectedLabels = lineItems
    .filter((item) => input.productIds.includes(item.product_id))
    .map((item) => item.name);

  return buildReturnReasonChoiceMessage({
    orderId: order.id,
    mode: "partial",
    productIds: input.productIds,
    itemLabels: selectedLabels,
  });
}

export async function createReturnWithReason(input: {
  supabase: SupabaseClient<Database>;
  orderId: string;
  customerId: string;
  conversationId: string;
  mode: "entire" | "partial";
  productIds?: string[];
  reason: string;
}): Promise<ReturnFlowMessage> {
  const order = await fetchOrderForReturn(
    input.supabase,
    input.customerId,
    input.orderId,
  );
  if (!order) {
    return {
      content: "I couldn't find that order. Please try again or contact support.",
      intent: "return_request",
    };
  }

  const lineItems = await fetchOrderLineItemsWithIds(input.supabase, order.cart_id);
  const selectedItems =
    input.mode === "entire"
      ? lineItems
      : lineItems.filter((item) => input.productIds?.includes(item.product_id));

  if (input.mode === "partial" && selectedItems.length === 0) {
    return {
      content: "Please select at least one valid item to return.",
      intent: "return_request",
    };
  }

  const request = await createReturnRequest({
    supabase: input.supabase,
    orderId: order.id,
    customerId: input.customerId,
    conversationId: input.conversationId,
    requestType: input.mode === "entire" ? "entire" : "partial",
    items:
      input.mode === "partial"
        ? selectedItems.map((item) => ({
            productId: item.product_id,
            productName: item.name,
            quantity: item.quantity,
          }))
        : undefined,
  });

  await updateReturnRequestReason({
    supabase: input.supabase,
    requestId: request.id,
    reason: input.reason,
  });

  const photoPrompt = buildReturnPhotoPrompt(request.id);
  const orderRef = formatOrderRef(order.id);
  const scopeLabel =
    input.mode === "entire"
      ? `full order #${orderRef}`
      : `${selectedItems.length} item${selectedItems.length === 1 ? "" : "s"} from #${orderRef}`;

  return {
    content: `Return started for ${scopeLabel}.\nReason: ${input.reason}\n\n${photoPrompt.content}`,
    intent: photoPrompt.intent,
  };
}

export async function startPartialItemReturn(input: {
  supabase: SupabaseClient<Database>;
  orderId: string;
  productId: string;
  customerId: string;
  conversationId: string;
}): Promise<ReturnFlowMessage> {
  const order = await fetchOrderForReturn(
    input.supabase,
    input.customerId,
    input.orderId,
  );
  if (!order) {
    return {
      content: "I couldn't find that order. Please try again or contact support.",
      intent: "return_request",
    };
  }

  const items = await fetchOrderLineItemsWithIds(input.supabase, order.cart_id);
  const selected = items.find((item) => item.product_id === input.productId);
  if (!selected) {
    return {
      content: "That item isn't on this order. Please pick another item or contact support.",
      intent: encodeReturnItemPickIntent({
        orderId: order.id,
        items: items.map((item) => ({ productId: item.product_id, label: item.name })),
        selectedProductIds: [],
      }),
    };
  }

  return continuePartialItemSelection({
    supabase: input.supabase,
    orderId: order.id,
    customerId: input.customerId,
    productIds: [input.productId],
  });
}
