import type { SupabaseClient } from "@supabase/supabase-js";
import { recordDpdpAuditEvent } from "@/lib/dpdp/audit";
import { createServiceClient } from "@/lib/supabase/service-client";
import { isMissingColumnError } from "@/lib/supabase/errors";
import type { Database } from "@/lib/types";

export type DeletionJobResult = {
  customerId: string;
  deletedAt: string;
  messagesDeleted: number;
  ordersAnonymized: number;
  conversationsCleared: number;
  datasetSince: string | null;
};

function anonymizedPhone(customerId: string): string {
  return `deleted_${customerId.replace(/-/g, "")}`;
}

export async function executeCustomerDeletionJob(
  customerId: string,
  options: { adminUserId?: string } = {},
): Promise<DeletionJobResult> {
  const supabase = createServiceClient();
  const deletedAt = new Date().toISOString();

  const customer = await fetchCustomerForDeletion(supabase, customerId);
  if (!customer) {
    throw new Error("Customer not found");
  }

  if (customer.deletion_status !== "pending_deletion") {
    throw new Error("No pending deletion request for this customer");
  }

  const datasetSince = customer.deleted_at;
  const datasetCutoff = datasetSince ?? "1970-01-01T00:00:00.000Z";

  const { data: conversations, error: conversationsError } = await supabase
    .from("conversations")
    .select("id")
    .eq("customer_id", customerId);

  if (conversationsError) throw conversationsError;

  const conversationIds = (conversations ?? []).map((row) => row.id);
  let messagesDeleted = 0;

  if (conversationIds.length > 0) {
    let messagesQuery = supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .in("conversation_id", conversationIds);

    if (datasetSince) {
      messagesQuery = messagesQuery.gt("created_at", datasetCutoff);
    }

    const { count, error: countError } = await messagesQuery;
    if (countError) throw countError;
    messagesDeleted = count ?? 0;

    let deleteQuery = supabase
      .from("messages")
      .delete()
      .in("conversation_id", conversationIds);

    if (datasetSince) {
      deleteQuery = deleteQuery.gt("created_at", datasetCutoff);
    }

    const { error: messagesError } = await deleteQuery;
    if (messagesError) throw messagesError;
  }

  const { error: cartsError } = await supabase
    .from("carts")
    .delete()
    .eq("customer_id", customerId);

  if (cartsError) throw cartsError;

  let ordersAnonymized = 0;

  if (datasetSince) {
    const { data: orderRows, error: ordersFetchError } = await supabase
      .from("orders")
      .select("id")
      .eq("customer_id", customerId)
      .gt("created_at", datasetCutoff);

    if (ordersFetchError) throw ordersFetchError;

    const orderIds = (orderRows ?? []).map((row) => row.id);
    if (orderIds.length > 0) {
      const { error: ordersError } = await supabase
        .from("orders")
        .update({
          delivery_address: null,
          payment_utr: null,
          notes: null,
        })
        .in("id", orderIds);

      if (ordersError) throw ordersError;
      ordersAnonymized = orderIds.length;
    }

    const { data: piiOrders, error: piiOrdersError } = await supabase
      .from("orders")
      .select("id")
      .eq("customer_id", customerId)
      .lte("created_at", datasetCutoff)
      .or("delivery_address.not.is.null,payment_utr.not.is.null,notes.not.is.null");

    if (piiOrdersError) throw piiOrdersError;

    const lingeringIds = (piiOrders ?? []).map((row) => row.id);
    if (lingeringIds.length > 0) {
      const { error: lingeringError } = await supabase
        .from("orders")
        .update({
          delivery_address: null,
          payment_utr: null,
          notes: null,
        })
        .in("id", lingeringIds);

      if (lingeringError) throw lingeringError;
      ordersAnonymized += lingeringIds.length;
    }
  } else {
    const { data: orderRows, error: ordersFetchError } = await supabase
      .from("orders")
      .select("id")
      .eq("customer_id", customerId);

    if (ordersFetchError) throw ordersFetchError;

    const orderIds = (orderRows ?? []).map((row) => row.id);
    if (orderIds.length > 0) {
      const { error: ordersError } = await supabase
        .from("orders")
        .update({
          delivery_address: null,
          payment_utr: null,
          notes: null,
        })
        .eq("customer_id", customerId);

      if (ordersError) throw ordersError;
      ordersAnonymized = orderIds.length;
    }
  }

  const customerUpdate = {
    name: null,
    address: null,
    phone: anonymizedPhone(customerId),
    dpdp_consent: false,
    dpdp_consent_at: null,
    consent_given: false,
    deletion_status: "deleted" as const,
    deleted_at: deletedAt,
  };

  const { error: customerError } = await supabase
    .from("customers")
    .update(customerUpdate)
    .eq("id", customerId);

  if (customerError) throw customerError;

  await recordDpdpAuditEvent(customerId, "consent_withdrawn", {
    reason: "deletion_approved",
    deletedAt,
    datasetSince,
  });

  await recordDpdpAuditEvent(customerId, "deletion_completed", {
    deletedAt,
    datasetSince,
    messagesDeleted,
    ordersAnonymized,
    conversationsCleared: conversationIds.length,
    adminUserId: options.adminUserId ?? null,
  });

  return {
    customerId,
    deletedAt,
    messagesDeleted,
    ordersAnonymized,
    conversationsCleared: conversationIds.length,
    datasetSince,
  };
}

async function fetchCustomerForDeletion(
  supabase: SupabaseClient<Database>,
  customerId: string,
) {
  const fullResult = await supabase
    .from("customers")
    .select("id, deletion_status, deleted_at")
    .eq("id", customerId)
    .maybeSingle();

  if (!fullResult.error) {
    return fullResult.data;
  }

  if (isMissingColumnError(fullResult.error, "deletion_status")) {
    return {
      id: customerId,
      deletion_status: null,
      deleted_at: null,
    };
  }

  throw fullResult.error;
}
