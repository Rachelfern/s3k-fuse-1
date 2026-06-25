import { parseCodCollectionFailedIntent } from "@/lib/orders/cod-collection-flow";
import { fetchOrderTracking } from "@/lib/orders/fetch-order-tracking";
import { resolvePaymentMethod } from "@/lib/orders/order-lifecycle";
import { mapShipmentStatusFromDb } from "@/lib/orders/shipment-status-compat";
import { isMissingColumnError, isMissingTableError } from "@/lib/supabase/errors";
import type {
  Database,
  Message,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  ReturnRequestStatus,
} from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";

export type OrderContext = {
  id: string;
  status: OrderStatus;
  total_amount: number;
  payment_status: PaymentStatus;
  payment_method: string;
  shipment_status: string;
  tracking_id: string | null;
  delivery_address: string | null;
  notes: string | null;
  created_at: string;
};

export type ReturnRequestContext = {
  id: string;
  order_id: string;
  status: ReturnRequestStatus | string;
  reason: string | null;
  created_at: string;
};

export type SupportTicketContext = {
  id: string;
  order_id: string | null;
  status: string;
  subject: string | null;
  created_at: string;
};

export type PendingConversationContext = {
  type: "cod_collection_failed";
  orderId: string;
  summary: string;
};

export type ConversationMemory = {
  transcript: string;
  recentMessages: Pick<Message, "sender_type" | "content" | "intent">[];
  recentSystemNotifications: string[];
  activeOrder: OrderContext | null;
  recentOrders: OrderContext[];
  activeReturnRequests: ReturnRequestContext[];
  supportTickets: SupportTicketContext[];
  pendingContext: PendingConversationContext | null;
  hasActiveOrder: boolean;
};

const DEFAULT_MESSAGE_LIMIT = 20;

function formatMessageLine(message: Pick<Message, "sender_type" | "content" | "intent">): string {
  const role =
    message.sender_type === "customer"
      ? "Customer"
      : message.sender_type === "system"
        ? "System"
        : "Assistant";
  const intentSuffix = message.intent ? ` [intent: ${message.intent}]` : "";
  return `${role}${intentSuffix}: ${message.content.trim()}`;
}

export function formatConversationTranscript(
  messages: Pick<Message, "sender_type" | "content" | "intent">[],
): string {
  if (messages.length === 0) {
    return "(no prior messages)";
  }

  return messages.map(formatMessageLine).join("\n");
}

export function findRecentCodCollectionFailedOrderId(
  messages: Pick<Message, "sender_type" | "content" | "intent">[],
): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message) continue;

    const fromIntent = parseCodCollectionFailedIntent(message.intent);
    if (fromIntent) return fromIntent;

    if (
      message.sender_type === "system" &&
      /cod payment not collected/i.test(message.content)
    ) {
      const orderMatch = message.content.match(/^Order:\s*(\S+)/im);
      if (orderMatch?.[1]) return orderMatch[1];
    }
  }

  return null;
}

function resolveActiveOrder(
  orders: OrderContext[],
  messages: Pick<Message, "sender_type" | "content" | "intent">[],
): OrderContext | null {
  if (orders.length === 0) return null;

  const contextualOrderId = findRecentCodCollectionFailedOrderId(messages);
  if (contextualOrderId) {
    return orders.find((order) => order.id === contextualOrderId) ?? orders[0] ?? null;
  }

  const openOrder = orders.find((order) => order.status !== "cancelled");
  return openOrder ?? orders[0] ?? null;
}

function resolvePendingContext(
  messages: Pick<Message, "sender_type" | "content" | "intent">[],
): PendingConversationContext | null {
  const orderId = findRecentCodCollectionFailedOrderId(messages);
  if (!orderId) return null;

  return {
    type: "cod_collection_failed",
    orderId,
    summary:
      "Cash on Delivery payment was not collected. Customer may be replying with delivery availability or payment arrangement.",
  };
}

function formatOrderContext(order: OrderContext): string {
  return [
    `Order ID: ${order.id}`,
    `Status: ${order.status}`,
    `Total: ₹${order.total_amount}`,
    `Payment: ${order.payment_method} — ${order.payment_status}`,
    `Shipment: ${order.shipment_status}`,
    order.tracking_id ? `Tracking: ${order.tracking_id}` : null,
    order.delivery_address ? `Delivery address: ${order.delivery_address}` : null,
    order.notes ? `Notes: ${order.notes}` : null,
    `Placed: ${order.created_at}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function formatConversationMemoryForPrompt(memory: ConversationMemory): string {
  const sections: string[] = [
    "=== Recent Conversation (oldest to newest) ===",
    memory.transcript,
  ];

  if (memory.recentSystemNotifications.length > 0) {
    sections.push(
      "",
      "=== Recent System Notifications ===",
      memory.recentSystemNotifications.join("\n\n"),
    );
  }

  if (memory.pendingContext) {
    sections.push(
      "",
      "=== Pending Action Context ===",
      `${memory.pendingContext.type}: ${memory.pendingContext.summary}`,
      `Referenced order: ${memory.pendingContext.orderId}`,
    );
  }

  if (memory.activeOrder) {
    sections.push("", "=== Active Order ===", formatOrderContext(memory.activeOrder));
  } else if (memory.recentOrders.length > 0) {
    sections.push(
      "",
      "=== Recent Orders ===",
      memory.recentOrders.map(formatOrderContext).join("\n\n"),
    );
  } else {
    sections.push("", "=== Orders ===", "No orders on file for this customer.");
  }

  if (memory.activeReturnRequests.length > 0) {
    sections.push(
      "",
      "=== Active Return Requests ===",
      memory.activeReturnRequests
        .map(
          (request) =>
            `${request.id} — order ${request.order_id} — ${request.status}${
              request.reason ? ` — reason: ${request.reason}` : ""
            }`,
        )
        .join("\n"),
    );
  }

  if (memory.supportTickets.length > 0) {
    sections.push(
      "",
      "=== Support Tickets ===",
      memory.supportTickets
        .map(
          (ticket) =>
            `${ticket.id} — ${ticket.status}${ticket.order_id ? ` — order ${ticket.order_id}` : ""}${
              ticket.subject ? ` — ${ticket.subject}` : ""
            }`,
        )
        .join("\n"),
    );
  }

  return sections.join("\n");
}

type OrderDbRow = {
  id: string;
  status: OrderStatus;
  total_amount: number;
  payment_status: PaymentStatus;
  payment_method?: PaymentMethod | null;
  shipment_status: string;
  tracking_id: string | null;
  delivery_address?: string | null;
  notes?: string | null;
  created_at: string;
  payment_utr?: string | null;
};

function mapOrderRow(row: OrderDbRow): OrderContext {
  return {
    id: row.id,
    status: row.status,
    total_amount: Number(row.total_amount),
    payment_status: row.payment_status,
    payment_method: resolvePaymentMethod({
      payment_method: row.payment_method,
      payment_utr: row.payment_utr ?? null,
    }),
    shipment_status: mapShipmentStatusFromDb(row.shipment_status),
    tracking_id: row.tracking_id,
    delivery_address: row.delivery_address ?? null,
    notes: row.notes ?? null,
    created_at: row.created_at,
  };
}

export async function fetchConversationMemory(
  supabase: SupabaseClient<Database>,
  input: {
    conversationId: string;
    customerId: string;
    messageLimit?: number;
  },
): Promise<ConversationMemory> {
  const messageLimit = input.messageLimit ?? DEFAULT_MESSAGE_LIMIT;

  const [messagesResult, ordersResult, returnsResult, ticketsResult] = await Promise.all([
    supabase
      .from("messages")
      .select("sender_type, content, intent, created_at")
      .eq("conversation_id", input.conversationId)
      .order("created_at", { ascending: false })
      .limit(messageLimit),
    supabase
      .from("orders")
      .select(
        "id, status, total_amount, payment_status, payment_method, payment_utr, shipment_status, tracking_id, delivery_address, notes, created_at",
      )
      .eq("customer_id", input.customerId)
      .neq("status", "cancelled")
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("return_requests")
      .select("id, order_id, status, reason, created_at")
      .eq("customer_id", input.customerId)
      .not("status", "in", '("refunded","rejected")')
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("support_tickets")
      .select("id, order_id, status, subject, created_at")
      .eq("conversation_id", input.conversationId)
      .not("status", "in", '("resolved","closed")')
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  if (messagesResult.error) throw messagesResult.error;

  let orders = (ordersResult.error ? [] : ordersResult.data ?? []) as OrderDbRow[];
  if (
    ordersResult.error &&
    !isMissingColumnError(ordersResult.error, "payment_method") &&
    !isMissingColumnError(ordersResult.error, "delivery_address")
  ) {
    throw ordersResult.error;
  }

  if (orders.length === 0 && ordersResult.error) {
    const legacyOrders = await supabase
      .from("orders")
      .select(
        "id, status, total_amount, payment_status, shipment_status, tracking_id, created_at",
      )
      .eq("customer_id", input.customerId)
      .neq("status", "cancelled")
      .order("created_at", { ascending: false })
      .limit(5);
    if (legacyOrders.error) throw legacyOrders.error;
    orders = (legacyOrders.data ?? []) as OrderDbRow[];
  }

  const orderedMessages = [...(messagesResult.data ?? [])].reverse();
  const recentOrders = orders.map(mapOrderRow);
  const activeOrder = resolveActiveOrder(recentOrders, orderedMessages);

  if (activeOrder) {
    const tracking = await fetchOrderTracking(supabase, activeOrder.id);
    if (tracking.data) {
      activeOrder.payment_status = tracking.data.payment_status;
      activeOrder.payment_method = tracking.data.payment_method;
      activeOrder.shipment_status = tracking.data.shipment_status;
      activeOrder.tracking_id = tracking.data.tracking_id;
    }
  }

  const recentSystemNotifications = orderedMessages
    .filter((message) => message.sender_type === "system")
    .slice(-5)
    .map((message) => message.content.trim());

  const activeReturnRequests =
    returnsResult.error && isMissingTableError(returnsResult.error, "return_requests")
      ? []
      : ((returnsResult.data ?? []) as ReturnRequestContext[]);

  const supportTickets =
    ticketsResult.error && isMissingTableError(ticketsResult.error, "support_tickets")
      ? []
      : ((ticketsResult.data ?? []) as SupportTicketContext[]);

  return {
    transcript: formatConversationTranscript(orderedMessages),
    recentMessages: orderedMessages,
    recentSystemNotifications,
    activeOrder,
    recentOrders,
    activeReturnRequests,
    supportTickets,
    pendingContext: resolvePendingContext(orderedMessages),
    hasActiveOrder: Boolean(activeOrder ?? recentOrders.length > 0),
  };
}

const FALSE_NO_ORDER_PATTERNS = [
  /\b(?:don't|do not|cannot|can't)\s+have\s+(?:any\s+)?(?:information about\s+)?(?:an?\s+)?(?:upcoming\s+)?order/i,
  /\bno\s+(?:active|current|recent|upcoming|previous)\s+order/i,
  /\b(?:don't|do not)\s+see\s+(?:any\s+)?order/i,
  /\bno orders on file/i,
  /\bwithout any order information/i,
];

export function rejectsExistingOrderContext(
  draft: string,
  memory: ConversationMemory,
): boolean {
  if (!memory.hasActiveOrder) return false;
  return FALSE_NO_ORDER_PATTERNS.some((pattern) => pattern.test(draft));
}

export function buildContextAwareFallbackReply(
  memory: ConversationMemory,
  customerMessage: string,
): string {
  const order = memory.activeOrder ?? memory.recentOrders[0];
  if (!order) {
    return "Thanks for your message — I can help with products, recommendations, orders, or your cart.";
  }

  if (memory.pendingContext?.type === "cod_collection_failed") {
    return `Thanks — I've noted your availability for order ${order.id}. Our team will arrange COD collection / redelivery and confirm the schedule here shortly.`;
  }

  const preview = customerMessage.trim().slice(0, 80);
  return `Thanks for your update about order ${order.id} (${order.status}). I've noted "${preview}" and our team will follow up here shortly.`;
}
