import { isCartViewRequest, isProductCatalogRequest, isTrackOrderRequest, isTrackReturnRequest, parseTrackReturnRequestId } from "@/lib/ai/message-intent";
import { encodeReturnTrackingIntent } from "@/lib/chat/return-intents";
import { commerceMessageCandidates } from "@/lib/hinglish";
import { DEFAULT_DELIVERY_FEE } from "@/lib/orders/create-order";
import { fetchTrackableReturnForCustomer } from "@/lib/orders/return-management-service";
import { formatReturnTrackingSummary } from "@/lib/orders/return-tracking-flow";
import { formatShipmentStatusLabel } from "@/lib/orders/shipment-utils";
import { CHAT_INTENTS, encodeOrderHistoryIntent } from "@/lib/chat/quick-replies";
import type { Order, OrderStatus, PaymentStatus } from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types";

export type ConversationFlowIntent =
  | "VIEW_CART"
  | "TRACK_ORDER"
  | "TRACK_RETURN"
  | "ORDER_HISTORY"
  | "CHECKOUT"
  | "PAY_NOW"
  | "CONTINUE_SHOPPING"
  | "CONTACT_SUPPORT"
  | "REFRESH_STATUS"
  | "BROWSE_PRODUCTS"
  | "REORDER"
  | "CHANGE_QUANTITY";

export type ConversationFlowResult = {
  type: ConversationFlowIntent;
  orderId?: string;
  returnRequestId?: string;
};


const ORDER_HISTORY_PATTERNS = [
  /\b(?:my|previous|recent|past)\s+orders?\b/i,
  /\border history\b/i,
];

const CHECKOUT_PATTERNS = [/^checkout$/i, /^place order$/i];
const PAY_NOW_PATTERNS = [/^pay now$/i];
const CONTINUE_SHOPPING_PATTERNS = [/^continue shopping$/i];
const CONTACT_SUPPORT_PATTERNS = [
  /^contact support$/i,
  /^i need help$/i,
  /^help$/i,
];
const BROWSE_PRODUCTS_PATTERNS = [/^browse products?$/i];

function matchesBrowseProducts(message: string): boolean {
  return (
    BROWSE_PRODUCTS_PATTERNS.some((pattern) => pattern.test(message.trim())) ||
    isProductCatalogRequest(message)
  );
}
const REFRESH_STATUS_PATTERNS = [/^refresh status$/i];
const REORDER_PATTERNS = [/^reorder$/i, /^order again$/i];
const CHANGE_QUANTITY_PATTERNS = [
  /^i'?d like a different quantity$/i,
  /^change quantity$/i,
  /^add one more$/i,
  /^(?:add|get)\s+(?:one|1)\s+more$/i,
];

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

export function classifyConversationFlow(message: string): ConversationFlowResult | null {
  const candidates = commerceMessageCandidates(message);
  if (candidates.length === 0) return null;

  for (const candidate of candidates) {
    const flow = classifyConversationFlowCandidate(candidate);
    if (flow) return flow;
  }

  return null;
}

function classifyConversationFlowCandidate(message: string): ConversationFlowResult | null {
  const trimmed = message.trim();

  if (isCartViewRequest(trimmed)) {
    return { type: "VIEW_CART" };
  }

  if (REFRESH_STATUS_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return { type: "REFRESH_STATUS" };
  }

  if (REORDER_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return { type: "REORDER" };
  }

  if (CHANGE_QUANTITY_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return { type: "CHANGE_QUANTITY" };
  }

  if (CHANGE_QUANTITY_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return { type: "CHANGE_QUANTITY" };
  }

  if (isTrackReturnRequest(trimmed)) {
    const explicitId = parseTrackReturnRequestId(trimmed);
    const trackReturnMatch = trimmed.match(TRACK_RETURN_PATTERNS[0]);
    const returnRequestId =
      explicitId || trackReturnMatch?.[1]?.trim() || undefined;
    return { type: "TRACK_RETURN", returnRequestId };
  }

  if (isTrackOrderRequest(trimmed)) {
    const trackMatch = trimmed.match(TRACK_ORDER_PATTERNS[0]);
    const orderId = trackMatch?.[1]?.trim();
    return { type: "TRACK_ORDER", orderId: orderId || undefined };
  }

  if (ORDER_HISTORY_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return { type: "ORDER_HISTORY" };
  }

  if (PAY_NOW_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return { type: "PAY_NOW" };
  }

  if (CHECKOUT_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return { type: "CHECKOUT" };
  }

  if (CONTINUE_SHOPPING_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return { type: "CONTINUE_SHOPPING" };
  }

  if (CONTACT_SUPPORT_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return { type: "CONTACT_SUPPORT" };
  }

  if (matchesBrowseProducts(trimmed)) {
    return { type: "BROWSE_PRODUCTS" };
  }

  return null;
}

type CartLine = {
  product_id: string;
  name_en: string;
  quantity: number;
  price: number;
};

type FlowMessage = {
  content: string;
  intent: string;
  sender_type: "admin" | "system";
  was_ai_drafted: boolean;
  cartSync?: CartLine[];
};

function formatCurrency(amount: number): string {
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

function formatOrderStatusLabel(status: OrderStatus): string {
  return status
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatPaymentStatus(status: PaymentStatus): string {
  switch (status) {
    case "verified":
      return "Paid";
    case "pending":
      return "Pending";
    case "verification_pending":
      return "Verification Pending";
    case "failed":
      return "Failed";
    default:
      return status;
  }
}

function estimateDelivery(status: OrderStatus, createdAt: string): string {
  if (status === "delivered") return "Delivered";
  if (status === "shipped") return "Today";

  const created = new Date(createdAt);
  const today = new Date();
  const sameDay =
    created.getDate() === today.getDate() &&
    created.getMonth() === today.getMonth() &&
    created.getFullYear() === today.getFullYear();

  if (sameDay && ["confirmed", "packed"].includes(status)) {
    return "Today";
  }

  return "1–2 business days";
}

export function formatOrderConfirmationMessage(
  orderId: string,
  totalAmount: number,
): string {
  return `✅ Order Confirmed

Order ID: ${orderId}
Amount: ${formatCurrency(totalAmount)}

Status: Confirmed

Your order has been placed successfully.`;
}

export function formatUpiPendingOrderMessage(
  orderId: string,
  totalAmount: number,
): string {
  return `📋 Order Received — UPI Verification Pending

Order ID: ${orderId}
Amount: ${formatCurrency(totalAmount)}

Status: Verification Pending

We've received your payment claim. Our team will verify your UPI payment shortly.`;
}

export function formatOrderDeliveredMessage(
  orderId: string,
  totalAmount: number,
): string {
  return `📬 Order Delivered

Order ID: ${orderId}
Amount: ${formatCurrency(totalAmount)}

Status: Delivered

Your order has arrived. We hope you enjoy your purchase.`;
}

export function formatOrderCancelledMessage(
  orderId: string,
  totalAmount: number,
  reason?: string | null,
): string {
  const lines = [
    `🚫 Order Cancelled`,
    "",
    `Order ID: ${orderId}`,
    `Amount: ${formatCurrency(totalAmount)}`,
    "",
    "Status: Cancelled",
    "",
    reason?.trim()
      ? `Reason: ${reason.trim()}`
      : "This order has been cancelled.",
  ];

  return lines.join("\n");
}

export function formatOrderStatusMessage(order: Pick<
  Order,
  | "id"
  | "status"
  | "payment_status"
  | "created_at"
  | "tracking_id"
  | "shipment_status"
>): string {
  const lines = [
    "📦 Order Status",
    "",
    `Order ID: ${order.id}`,
    "",
    `Status: ${formatOrderStatusLabel(order.status)}`,
    `Payment: ${formatPaymentStatus(order.payment_status)}`,
  ];

  if (order.tracking_id) {
    lines.push(`Tracking ID: ${order.tracking_id}`);
  }

  if (order.shipment_status) {
    lines.push(
      `Shipment Status: ${formatShipmentStatusLabel(order.shipment_status)}`,
    );
  }

  lines.push(
    `Estimated Delivery: ${estimateDelivery(order.status, order.created_at)}`,
  );

  return lines.join("\n");
}

export function formatOrderHistoryMessage(
  orders: Pick<Order, "id" | "status" | "total_amount">[],
): string {
  if (orders.length === 0) {
    return "You don't have any orders yet.\n\nTap Browse Products or Best Sellers to start shopping.";
  }

  const lines = orders.map((order, index) => {
    return `${index + 1}. Order ${order.id}
   ${formatCurrency(Number(order.total_amount))}
   ${formatOrderStatusLabel(order.status)}`;
  });

  return `Your Recent Orders:\n\n${lines.join("\n\n")}`;
}

export function formatCartViewMessage(
  items: CartLine[],
  total: number,
): string {
  if (items.length === 0) {
    return "🛒 Your cart is empty.\n\nBrowse products or check out today's best sellers.";
  }

  const lines = items.map(
    (item) =>
      `${item.name_en} × ${item.quantity}\n${formatCurrency(item.price * item.quantity)}`,
  );

  return `🛒 Cart\n\n${lines.join("\n\n")}\n\nTotal: ${formatCurrency(total)}`;
}

async function fetchActiveCartLines(
  supabase: SupabaseClient<Database>,
  customerId: string,
): Promise<{ items: CartLine[]; total: number; cartId: string | null }> {
  const { data: cart, error: cartError } = await supabase
    .from("carts")
    .select("id")
    .eq("customer_id", customerId)
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (cartError) throw cartError;
  if (!cart?.id) {
    return { items: [], total: 0, cartId: null };
  }

  const { data: rows, error: itemsError } = await supabase
    .from("cart_items")
    .select("product_id, quantity, price_snapshot, products ( name_en )")
    .eq("cart_id", cart.id);

  if (itemsError) throw itemsError;

  const items: CartLine[] = (rows ?? []).map((row) => ({
    product_id: row.product_id ?? "",
    name_en:
      (row.products as { name_en: string } | null)?.name_en ?? "Item",
    quantity: row.quantity,
    price: Number(row.price_snapshot),
  }));

  const total = items.reduce(
    (sum, item) => sum + item.quantity * item.price,
    0,
  );

  return { items, total, cartId: cart.id };
}

async function fetchLatestOrder(
  supabase: SupabaseClient<Database>,
  customerId: string,
  orderId?: string,
) {
  let query = supabase
    .from("orders")
    .select(
      "id, status, payment_status, total_amount, created_at, tracking_id, shipment_status",
    )
    .eq("customer_id", customerId);

  if (orderId) {
    query = query.eq("id", orderId);
  } else {
    query = query.order("created_at", { ascending: false }).limit(1);
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data;
}

async function fetchRecentOrders(
  supabase: SupabaseClient<Database>,
  customerId: string,
  limit = 5,
) {
  const { data, error } = await supabase
    .from("orders")
    .select("id, status, total_amount")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data ?? [];
}

async function reorderLatestOrder(
  supabase: SupabaseClient<Database>,
  customerId: string,
  conversationId: string,
): Promise<{ items: CartLine[]; total: number } | null> {
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id, cart_id")
    .eq("customer_id", customerId)
    .neq("status", "cancelled")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (orderError) throw orderError;
  if (!order?.cart_id) return null;

  const { data: cartItems, error: itemsError } = await supabase
    .from("cart_items")
    .select("product_id, quantity, price_snapshot, products ( name_en, active )")
    .eq("cart_id", order.cart_id);

  if (itemsError) throw itemsError;
  if (!cartItems?.length) return null;

  const lines: CartLine[] = cartItems
    .filter((row) => row.product_id)
    .map((row) => ({
      product_id: row.product_id ?? "",
      name_en:
        (row.products as { name_en: string } | null)?.name_en ?? "Item",
      quantity: row.quantity,
      price: Number(row.price_snapshot),
    }));

  if (lines.length === 0) return null;

  await supabase
    .from("carts")
    .update({ status: "abandoned" })
    .eq("customer_id", customerId)
    .eq("status", "active");

  const { data: newCart, error: cartError } = await supabase
    .from("carts")
    .insert({
      customer_id: customerId,
      conversation_id: conversationId,
      status: "active",
    })
    .select("id")
    .single();

  if (cartError) throw cartError;

  const { error: insertError } = await supabase.from("cart_items").insert(
    lines.map((line) => ({
      cart_id: newCart.id,
      product_id: line.product_id,
      quantity: line.quantity,
      price_snapshot: line.price,
    })),
  );

  if (insertError) throw insertError;

  const total = lines.reduce(
    (sum, item) => sum + item.quantity * item.price,
    0,
  );

  return { items: lines, total };
}

export async function handleConversationFlow(input: {
  supabase: SupabaseClient<Database>;
  flow: ConversationFlowResult;
  customerId: string;
  conversationId: string;
  localCartItems?: {
    productId: string;
    productName: string;
    quantity: number;
    unitPrice: number;
  }[];
}): Promise<FlowMessage | null> {
  const { supabase, flow, customerId } = input;

  switch (flow.type) {
    case "VIEW_CART": {
      const dbCart = await fetchActiveCartLines(supabase, customerId);
      let items = dbCart.items;
      let total = dbCart.total;

      if (input.localCartItems?.length) {
        const merged = new Map<string, CartLine>();
        for (const item of items) {
          merged.set(item.product_id, item);
        }
        for (const item of input.localCartItems) {
          const existing = merged.get(item.productId);
          if (existing) {
            merged.set(item.productId, {
              ...existing,
              quantity: Math.max(existing.quantity, item.quantity),
            });
          } else {
            merged.set(item.productId, {
              product_id: item.productId,
              name_en: item.productName,
              quantity: item.quantity,
              price: item.unitPrice,
            });
          }
        }
        items = [...merged.values()];
        total = items.reduce(
          (sum, item) => sum + item.quantity * item.price,
          0,
        );
      }

      const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

      return {
        content:
          items.length === 0
            ? "Your cart is empty.\n\nBrowse products to get started."
            : `You have ${itemCount} item${itemCount === 1 ? "" : "s"} in your cart (${formatCurrency(total)}).\n\nTap View Cart below to review or update items.`,
        intent:
          items.length === 0 ? CHAT_INTENTS.EMPTY_CART : CHAT_INTENTS.CART_UPDATED,
        sender_type: "admin",
        was_ai_drafted: false,
      };
    }

    case "TRACK_RETURN": {
      const returnRequest = await fetchTrackableReturnForCustomer(
        customerId,
        flow.returnRequestId,
      );

      if (!returnRequest) {
        return {
          content:
            "You don't have an active return request to track yet.\n\nStart a return from your order or ask about our return policy.",
          intent: CHAT_INTENTS.RETURN_REQUEST,
          sender_type: "admin",
          was_ai_drafted: false,
        };
      }

      return {
        content: formatReturnTrackingSummary(returnRequest),
        intent: encodeReturnTrackingIntent(returnRequest.id),
        sender_type: "admin",
        was_ai_drafted: false,
      };
    }

    case "TRACK_ORDER": {
      const order = await fetchLatestOrder(
        supabase,
        customerId,
        flow.orderId,
      );

      if (!order) {
        return {
          content:
            "You don't have any orders to track yet.\n\nStart shopping and I'll help you place your first order.",
          intent: CHAT_INTENTS.EMPTY_CART,
          sender_type: "admin",
          was_ai_drafted: false,
        };
      }

      return {
        content: `${formatOrderStatusMessage(order)}\n\nTap Track Order below for the full shipment timeline.`,
        intent: encodeOrderHistoryIntent([order.id]),
        sender_type: "admin",
        was_ai_drafted: false,
      };
    }

    case "REFRESH_STATUS": {
      const order = await fetchLatestOrder(supabase, customerId);

      if (!order) {
        return {
          content:
            "You don't have any orders to track yet.\n\nStart shopping and I'll help you place your first order.",
          intent: CHAT_INTENTS.EMPTY_CART,
          sender_type: "admin",
          was_ai_drafted: false,
        };
      }

      return {
        content: `${formatOrderStatusMessage(order)}\n\nTap Track Order below for the full shipment timeline.`,
        intent: encodeOrderHistoryIntent([order.id]),
        sender_type: "admin",
        was_ai_drafted: false,
      };
    }

    case "ORDER_HISTORY": {
      const orders = await fetchRecentOrders(supabase, customerId);

      return {
        content: formatOrderHistoryMessage(orders),
        intent:
          orders.length > 0
            ? encodeOrderHistoryIntent(orders.map((order) => order.id))
            : CHAT_INTENTS.EMPTY_CART,
        sender_type: "admin",
        was_ai_drafted: false,
      };
    }

    case "CONTINUE_SHOPPING": {
      return {
        content:
          "Sure! Browse the full menu or tell me what you're looking for.",
        intent: CHAT_INTENTS.CONTINUE_SHOPPING,
        sender_type: "admin",
        was_ai_drafted: false,
      };
    }

    case "CONTACT_SUPPORT": {
      return {
        content:
          "I'm here to help! You can ask about products, orders, or delivery.\n\nFor urgent issues, reply with your order ID and we'll look into it right away.",
        intent: CHAT_INTENTS.CONTACT_SUPPORT,
        sender_type: "admin",
        was_ai_drafted: false,
      };
    }

    case "CHECKOUT": {
      const dbCart = await fetchActiveCartLines(supabase, customerId);
      const items = dbCart.items;
      const subtotal = dbCart.total;

      if (items.length === 0 && !input.localCartItems?.length) {
        return {
          content: "Your cart is empty.\n\nBrowse products to get started.",
          intent: CHAT_INTENTS.EMPTY_CART,
          sender_type: "admin",
          was_ai_drafted: false,
        };
      }

      const effectiveSubtotal =
        subtotal > 0
          ? subtotal
          : (input.localCartItems ?? []).reduce(
              (sum, item) => sum + item.quantity * item.unitPrice,
              0,
            );

      const deliveryFee = DEFAULT_DELIVERY_FEE;
      const total = effectiveSubtotal + deliveryFee;

      return {
        content: `Your order total is ${formatCurrency(total)} (incl. delivery).\n\nTap Checkout below to enter delivery details and pay.`,
        intent: CHAT_INTENTS.CHECKOUT_PROMPT,
        sender_type: "admin",
        was_ai_drafted: false,
      };
    }

    case "PAY_NOW":
      return {
        content:
          "Complete checkout on the payment page to place your order securely.",
        intent: CHAT_INTENTS.CHECKOUT_PROMPT,
        sender_type: "admin",
        was_ai_drafted: false,
      };

    case "BROWSE_PRODUCTS":
      return {
        content:
          "Browse our full menu with search, categories, and product cards on the catalog page.",
        intent: CHAT_INTENTS.BROWSE_PRODUCTS,
        sender_type: "admin",
        was_ai_drafted: false,
      };

    case "REORDER": {
      const result = await reorderLatestOrder(
        supabase,
        customerId,
        input.conversationId,
      );

      if (!result) {
        return {
          content:
            "You don't have a previous order to reorder yet.\n\nBrowse products to get started.",
          intent: CHAT_INTENTS.EMPTY_CART,
          sender_type: "admin",
          was_ai_drafted: false,
        };
      }

      return {
        content: `✓ Reordered from your last order (${formatCurrency(result.total)}).\n\nTap View Cart below to review items.`,
        intent: CHAT_INTENTS.CART_UPDATED,
        sender_type: "admin",
        was_ai_drafted: false,
        cartSync: result.items,
      };
    }

    case "CHANGE_QUANTITY":
      return {
        content:
          "No problem — tell me the item and quantity (e.g. \"add 3 dal\" or \"add 2 paneer\").",
        intent: "clarification",
        sender_type: "admin",
        was_ai_drafted: false,
      };

    default:
      return null;
  }
}