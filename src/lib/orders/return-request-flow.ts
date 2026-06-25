import { STORE_POLICIES } from "@/lib/support/store-policies";
import { CHAT_INTENTS } from "@/lib/chat/quick-replies";
import type { Order, OrderStatus } from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types";

export const RETURN_REQUEST_INTENT_PREFIX = "return_request|";
export const RETURN_ORDER_CARD_INTENT_PREFIX = "return_order_card|";
export const REFUND_REQUEST_INTENT_PREFIX = "refund_request|";

const RETURN_WINDOW_DAYS = 7;

export type ReturnEligibility = {
  eligible: boolean;
  reason?: string;
};

export type ReturnRequestFlowResult = {
  content: string;
  intent: string;
};

export type ReturnOrderLineItem = {
  productId: string;
  name: string;
  quantity: number;
  lineTotal: number;
};

function formatCurrency(amount: number): string {
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

export function formatOrderRef(orderId: string): string {
  const short = orderId.replace(/-/g, "").slice(0, 8);
  return `o_${short}`;
}

function formatDeliveredDate(createdAt: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(new Date(createdAt));
}

export function checkReturnEligibility(
  order: Pick<Order, "status" | "created_at">,
): ReturnEligibility {
  if (order.status === "cancelled") {
    return {
      eligible: false,
      reason: "Cancelled orders aren't eligible for returns.",
    };
  }

  if (order.status !== "delivered") {
    return {
      eligible: false,
      reason:
        "Returns can be started once your order has been delivered.",
    };
  }

  const deliveredAt = new Date(order.created_at).getTime();
  const daysSince = (Date.now() - deliveredAt) / 86_400_000;
  if (daysSince > RETURN_WINDOW_DAYS) {
    return {
      eligible: false,
      reason: `The return window is ${RETURN_WINDOW_DAYS} days from delivery.`,
    };
  }

  return { eligible: true };
}

export function encodeReturnRequestIntent(orderId: string): string {
  return `${RETURN_REQUEST_INTENT_PREFIX}${orderId}`;
}

export function encodeReturnOrderCardIntent(orderId: string): string {
  return `${RETURN_ORDER_CARD_INTENT_PREFIX}${orderId}`;
}

export function parseReturnOrderCardIntent(intent: string | null): string | null {
  if (!intent?.startsWith(RETURN_ORDER_CARD_INTENT_PREFIX)) return null;
  const orderId = intent.slice(RETURN_ORDER_CARD_INTENT_PREFIX.length).trim();
  return orderId || null;
}

export function encodeRefundRequestIntent(orderId: string): string {
  return `${REFUND_REQUEST_INTENT_PREFIX}${orderId}`;
}

export function parseReturnRequestIntent(intent: string | null): string | null {
  if (!intent?.startsWith(RETURN_REQUEST_INTENT_PREFIX)) return null;
  const orderId = intent.slice(RETURN_REQUEST_INTENT_PREFIX.length).trim();
  return orderId || null;
}

/** Follow-up when customer names a specific item after return_item quick reply. */
export function parseReturnItemFollowUp(
  message: string,
  recentIntent: string | null | undefined,
): { orderId: string; itemQuery: string } | null {
  const orderId = parseReturnRequestIntent(recentIntent ?? null);
  if (!orderId) return null;

  const trimmed = message.trim();
  const match = trimmed.match(/^return\s+(?:the\s+)?(.+)$/i);
  if (!match?.[1]) return null;

  const itemQuery = match[1].trim();
  if (/^(?:my\s+)?order$/i.test(itemQuery)) return null;
  if (/^this\s+item$/i.test(itemQuery)) return null;

  return { orderId, itemQuery };
}

export function buildReturnItemSubmissionResponse(input: {
  orderId: string;
  itemQuery: string;
}): ReturnRequestFlowResult {
  const orderRef = formatOrderRef(input.orderId);

  return {
    content: `Return request received for "${input.itemQuery}" from Order #${orderRef}.

Our team will review within 1 business day and message you here with pickup or refund next steps.`,
    intent: CHAT_INTENTS.RETURN_REQUEST_SUBMITTED,
  };
}

export function parseReturnQuickReplyMessage(message: string): {
  type: "entire" | "item";
  orderId: string;
} | null {
  const trimmed = message.trim();

  const entireWithId = trimmed.match(/^return_entire\|(.+)$/i);
  if (entireWithId?.[1]) {
    return { type: "entire", orderId: entireWithId[1].trim() };
  }

  const itemWithId = trimmed.match(/^return_item\|(.+)$/i);
  if (itemWithId?.[1]) {
    return { type: "item", orderId: itemWithId[1].trim() };
  }

  return null;
}

async function fetchLatestEligibleDeliveredOrder(
  supabase: SupabaseClient<Database>,
  customerId: string,
  orderId?: string,
) {
  if (orderId) {
    const { data, error } = await supabase
      .from("orders")
      .select(
        "id, status, payment_status, total_amount, delivery_fee, created_at, tracking_id, shipment_status, cart_id",
      )
      .eq("customer_id", customerId)
      .eq("id", orderId)
      .maybeSingle();

    if (error) throw error;
    return data;
  }

  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, status, payment_status, total_amount, delivery_fee, created_at, tracking_id, shipment_status, cart_id",
    )
    .eq("customer_id", customerId)
    .eq("status", "delivered")
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) throw error;

  for (const order of data ?? []) {
    if (checkReturnEligibility(order).eligible) {
      return order;
    }
  }

  return null;
}

async function fetchOrderLineItems(
  supabase: SupabaseClient<Database>,
  cartId: string | null,
): Promise<ReturnOrderLineItem[]> {
  if (!cartId) return [];

  const { data, error } = await supabase
    .from("cart_items")
    .select("product_id, quantity, price_snapshot, products ( name_en )")
    .eq("cart_id", cartId);

  if (error) throw error;

  return (data ?? [])
    .filter((row) => row.product_id)
    .map((row) => ({
      productId: row.product_id as string,
      name: (row.products as { name_en: string } | null)?.name_en ?? "Item",
      quantity: row.quantity,
      lineTotal: row.quantity * Number(row.price_snapshot),
    }));
}

function buildReturnOrderCardContent(input: {
  order: Pick<Order, "id" | "created_at">;
  items: ReturnOrderLineItem[];
}): string {
  const orderRef = formatOrderRef(input.order.id);
  const deliveredLabel = formatDeliveredDate(input.order.created_at);
  const itemLines =
    input.items.length > 0
      ? input.items
          .map((item) => `• ${item.name} × ${item.quantity}`)
          .join("\n")
      : "• (No line items found)";

  return `📦 Latest Delivered Order

Order ID: ${orderRef}
Delivered: ${deliveredLabel}

Items:
${itemLines}

Would you like to:`;
}

async function buildEligibleReturnMessage(input: {
  order: Pick<Order, "id" | "status" | "total_amount" | "delivery_fee" | "created_at" | "cart_id">;
  isRefund: boolean;
  supabase: SupabaseClient<Database>;
}): Promise<ReturnRequestFlowResult> {
  const items = await fetchOrderLineItems(input.supabase, input.order.cart_id ?? null);

  return {
    content: buildReturnOrderCardContent({ order: input.order, items }),
    intent: encodeReturnOrderCardIntent(input.order.id),
  };
}

export async function buildReturnRequestResponse(input: {
  supabase: SupabaseClient<Database>;
  customerId: string;
  isRefund: boolean;
  orderId?: string;
}): Promise<ReturnRequestFlowResult> {
  const order = await fetchLatestEligibleDeliveredOrder(
    input.supabase,
    input.customerId,
    input.orderId,
  );

  if (!order) {
    return {
      content:
        "You don't have a delivered order eligible for return right now.\n\nOnce an order is delivered, I can help you start a return or refund here.",
      intent: input.isRefund ? "refund_request" : "return_request",
    };
  }

  const eligibility = checkReturnEligibility(order);

  if (!eligibility.eligible) {
    const orderRef = formatOrderRef(order.id);
    const total = Number(order.total_amount) + Number(order.delivery_fee ?? 0);

    return {
      content: `Order #${orderRef} (${formatCurrency(total)}) isn't eligible for a return right now.

${eligibility.reason}

${STORE_POLICIES.returnPolicy}`,
      intent: input.isRefund ? "refund_request" : "return_request",
    };
  }

  return buildEligibleReturnMessage({
    order,
    isRefund: input.isRefund,
    supabase: input.supabase,
  });
}

export async function buildReturnActionResponse(input: {
  supabase: SupabaseClient<Database>;
  customerId: string;
  type: "entire" | "item";
  orderId?: string;
}): Promise<ReturnRequestFlowResult> {
  const order = await fetchLatestEligibleDeliveredOrder(
    input.supabase,
    input.customerId,
    input.orderId || undefined,
  );

  if (!order) {
    return {
      content:
        "I couldn't find an eligible delivered order. Ask to return your latest order or contact support.",
      intent: "return_request",
    };
  }

  const orderRef = formatOrderRef(order.id);

  if (input.type === "entire") {
    return {
      content: `Return request received for Order #${orderRef}.

Our team will review within 1 business day and message you here with pickup or refund next steps.`,
      intent: CHAT_INTENTS.RETURN_REQUEST_SUBMITTED,
    };
  }

  const items = await fetchOrderLineItems(input.supabase, order.cart_id);

  if (items.length === 0) {
    return {
      content: `I couldn't load items for Order #${orderRef}. Please contact support for help.`,
      intent: encodeReturnOrderCardIntent(order.id),
    };
  }

  const itemLines = items
    .map(
      (item, index) =>
        `${index + 1}. ${item.name} × ${item.quantity} — ${formatCurrency(item.lineTotal)}`,
    )
    .join("\n");

  return {
    content: `Select the item(s) to return from Order #${orderRef}:

${itemLines}

Tap an item below to start your return:`,
    intent: encodeReturnRequestIntent(order.id),
  };
}

export async function fetchReturnOrderLineItems(
  supabase: SupabaseClient<Database>,
  cartId: string | null,
): Promise<ReturnOrderLineItem[]> {
  return fetchOrderLineItems(supabase, cartId);
}
