import {
  buildReturnStatusUpdateMessage,
  encodeReturnStatusIntent,
  type ReturnAdminAction,
  type ReturnWorkflowStatus,
} from "@/lib/orders/return-status-timeline";
import { formatOrderRef } from "@/lib/orders/return-request-flow";
import { createServiceClient } from "@/lib/supabase/service-client";
import type { ReturnRequest } from "@/lib/types";

export type ReturnRequestListRow = ReturnRequest & {
  items?: { product_name: string; quantity: number }[];
};

export type ReturnMetrics = {
  pending: number;
  approved: number;
  pickup_scheduled: number;
  picked_up: number;
  refunded: number;
};

function generateMockPickupReference(): string {
  return `PKP-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function generateMockRefundReference(): string {
  return `REF-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
}

async function fetchOrderRefundAmount(orderId: string): Promise<number> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("orders")
    .select("total_amount, delivery_fee")
    .eq("id", orderId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return 0;

  return Number(data.total_amount) + Number(data.delivery_fee ?? 0);
}

async function notifyCustomerOfStatusChange(input: {
  request: ReturnRequest;
  status: ReturnWorkflowStatus;
  pickupReference?: string | null;
  refundReference?: string | null;
  refundAmount?: number | null;
  rejectReason?: string | null;
}): Promise<void> {
  if (!input.request.conversation_id) return;

  const supabase = createServiceClient();
  const content = buildReturnStatusUpdateMessage({
    requestId: input.request.id,
    orderId: input.request.order_id,
    status: input.status,
    pickupReference: input.pickupReference,
    refundReference: input.refundReference,
    refundAmount: input.refundAmount,
    rejectReason: input.rejectReason,
  });

  const intent = encodeReturnStatusIntent(input.request.id, input.status);

  const { error } = await supabase.from("messages").insert({
    conversation_id: input.request.conversation_id,
    sender_type: "system",
    content,
    intent,
    was_ai_drafted: false,
  });

  if (error) {
    console.error("[RETURN MANAGEMENT] Failed to notify customer:", error);
  }
}

async function fetchReturnRequestById(
  requestId: string,
): Promise<ReturnRequest | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("return_requests")
    .select("*")
    .eq("id", requestId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function fetchReturnMetrics(): Promise<ReturnMetrics> {
  const supabase = createServiceClient();
  const statuses: (keyof ReturnMetrics)[] = [
    "pending",
    "approved",
    "pickup_scheduled",
    "picked_up",
    "refunded",
  ];

  const results = await Promise.all(
    statuses.map((status) =>
      supabase
        .from("return_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", status),
    ),
  );

  const metrics: ReturnMetrics = {
    pending: 0,
    approved: 0,
    pickup_scheduled: 0,
    picked_up: 0,
    refunded: 0,
  };

  statuses.forEach((status, index) => {
    const result = results[index];
    if (result.error) throw result.error;
    metrics[status] = result.count ?? 0;
  });

  return metrics;
}

export async function fetchReturnRequestsByStatus(
  status?: ReturnWorkflowStatus,
): Promise<ReturnRequestListRow[]> {
  const supabase = createServiceClient();

  let query = supabase
    .from("return_requests")
    .select("*")
    .order("created_at", { ascending: false });

  if (status) {
    query = query.eq("status", status);
  } else {
    query = query.in("status", [
      "pending",
      "approved",
      "pickup_scheduled",
      "picked_up",
      "refunded",
      "rejected",
    ]);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []) as ReturnRequestListRow[];
}

export async function fetchReturnRequestsForOrder(
  orderId: string,
  customerId?: string,
): Promise<ReturnRequestListRow[]> {
  const supabase = createServiceClient();

  let query = supabase
    .from("return_requests")
    .select("*")
    .eq("order_id", orderId)
    .order("created_at", { ascending: false });

  if (customerId) {
    query = query.eq("customer_id", customerId);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []) as ReturnRequestListRow[];
}

export async function fetchTrackableReturnForCustomer(
  customerId: string,
  returnRequestId?: string,
): Promise<ReturnRequest | null> {
  const supabase = createServiceClient();

  if (returnRequestId) {
    const { data, error } = await supabase
      .from("return_requests")
      .select("*")
      .eq("id", returnRequestId)
      .eq("customer_id", customerId)
      .maybeSingle();

    if (error) throw error;
    return data;
  }

  const { data, error } = await supabase
    .from("return_requests")
    .select("*")
    .eq("customer_id", customerId)
    .not("status", "in", '("awaiting_reason","awaiting_photo")')
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function executeReturnAdminAction(input: {
  requestId: string;
  action: ReturnAdminAction;
  rejectReason?: string;
}): Promise<ReturnRequest> {
  const request = await fetchReturnRequestById(input.requestId);
  if (!request) throw new Error("Return request not found.");

  const supabase = createServiceClient();
  const now = new Date().toISOString();

  let update: Partial<ReturnRequest> & { updated_at: string } = {
    updated_at: now,
  };
  let nextStatus: ReturnWorkflowStatus = request.status as ReturnWorkflowStatus;

  switch (input.action) {
    case "approve":
      if (request.status !== "pending") {
        throw new Error("Only pending returns can be approved.");
      }
      nextStatus = "approved";
      update = { ...update, status: "approved", approved_at: now };
      break;

    case "reject":
      if (request.status !== "pending") {
        throw new Error("Only pending returns can be rejected.");
      }
      nextStatus = "rejected";
      update = {
        ...update,
        status: "rejected",
        rejected_at: now,
        reject_reason: input.rejectReason?.trim() || "Does not meet return policy",
      };
      break;

    case "schedule_pickup":
      if (request.status !== "approved") {
        throw new Error("Pickup can only be scheduled for approved returns.");
      }
      nextStatus = "pickup_scheduled";
      update = {
        ...update,
        status: "pickup_scheduled",
        pickup_scheduled_at: now,
        pickup_reference: generateMockPickupReference(),
      };
      break;

    case "mark_picked_up":
      if (request.status !== "pickup_scheduled") {
        throw new Error("Only scheduled pickups can be marked as picked up.");
      }
      nextStatus = "picked_up";
      update = { ...update, status: "picked_up", picked_up_at: now };
      break;

    case "process_refund":
      if (request.status !== "picked_up") {
        throw new Error("Refund can only be processed after pickup.");
      }
      nextStatus = "refunded";
      update = {
        ...update,
        status: "refunded",
        refunded_at: now,
        refund_reference: generateMockRefundReference(),
      };
      break;

    default:
      throw new Error("Unknown action.");
  }

  const { data, error } = await supabase
    .from("return_requests")
    .update(update)
    .eq("id", input.requestId)
    .select("*")
    .single();

  if (error) throw error;

  const refundAmount =
    input.action === "process_refund"
      ? await fetchOrderRefundAmount(data.order_id)
      : null;

  await notifyCustomerOfStatusChange({
    request: data,
    status: nextStatus,
    pickupReference: data.pickup_reference,
    refundReference: data.refund_reference,
    refundAmount,
    rejectReason: data.reject_reason,
  });

  console.log("[RETURN MANAGEMENT]", {
    requestId: input.requestId,
    action: input.action,
    orderRef: formatOrderRef(request.order_id),
    status: nextStatus,
  });

  return data;
}
