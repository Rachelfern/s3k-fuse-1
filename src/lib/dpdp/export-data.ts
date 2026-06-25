import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingColumnError } from "@/lib/supabase/errors";
import { resolvePaymentMethod } from "@/lib/orders/order-lifecycle";
import { createServiceClient } from "@/lib/supabase/service-client";
import {
  getCustomerDpdpState,
  isEffectivelyDeleted,
} from "@/lib/dpdp/customer-data";
import type { Database, PaymentMethod } from "@/lib/types";

const CUSTOMER_SELECT_DPDP =
  "id, name, phone, address, order_count, total_spent, dpdp_consent, dpdp_consent_at, deletion_status, deleted_at, created_at";

const CUSTOMER_SELECT_LEGACY =
  "id, name, phone, address, order_count, total_spent, consent_given, created_at";

const ORDER_SELECT_WITH_PAYMENT =
  "id, status, total_amount, delivery_fee, payment_method, payment_status, payment_utr, notes, delivery_address, shipment_status, tracking_id, created_at, updated_at";

const ORDER_SELECT_LEGACY =
  "id, status, total_amount, delivery_fee, payment_status, payment_utr, notes, delivery_address, shipment_status, tracking_id, created_at, updated_at";

type CustomerExportRow = {
  id: string;
  name: string | null;
  phone: string;
  address: string | null;
  order_count: number;
  total_spent: number;
  dpdp_consent?: boolean;
  dpdp_consent_at?: string | null;
  consent_given?: boolean;
  deletion_status?: string | null;
  deleted_at?: string | null;
  created_at: string;
};

type OrderExportRow = {
  id: string;
  status: string;
  total_amount: number;
  delivery_fee: number;
  payment_method?: PaymentMethod | null;
  payment_status: string;
  payment_utr: string | null;
  notes: string | null;
  delivery_address: string | null;
  shipment_status: string;
  tracking_id: string | null;
  created_at: string;
  updated_at: string;
};

function buildDeletedExport(customerId: string, deletedAt: string | null) {
  return {
    exportedAt: new Date().toISOString(),
    deletionStatus: "deleted" as const,
    deletedAt,
    notice:
      "Your personal data has been deleted. This export contains no personal information.",
    profile: {
      id: customerId,
      status: "deleted" as const,
      name: null,
      phone: null,
      address: null,
      dpdpConsent: false,
      dpdpConsentAt: null,
    },
    addresses: [] as { type: string; address: string }[],
    orders: [] as Record<string, unknown>[],
    chatHistory: [] as Record<string, unknown>[],
  };
}

async function fetchCustomerForExport(
  supabase: SupabaseClient<Database>,
  customerId: string,
): Promise<CustomerExportRow | null> {
  const dpdpResult = await supabase
    .from("customers")
    .select(CUSTOMER_SELECT_DPDP)
    .eq("id", customerId)
    .maybeSingle();

  if (!dpdpResult.error) {
    return dpdpResult.data as CustomerExportRow | null;
  }

  if (
    isMissingColumnError(dpdpResult.error, "dpdp_consent") ||
    isMissingColumnError(dpdpResult.error, "dpdp_consent_at") ||
    isMissingColumnError(dpdpResult.error, "deletion_status") ||
    isMissingColumnError(dpdpResult.error, "deleted_at")
  ) {
    const legacyResult = await supabase
      .from("customers")
      .select(CUSTOMER_SELECT_LEGACY)
      .eq("id", customerId)
      .maybeSingle();

    if (legacyResult.error) throw legacyResult.error;
    if (!legacyResult.data) return null;

    const row = legacyResult.data as CustomerExportRow;
    return {
      ...row,
      dpdp_consent: row.consent_given ?? false,
      dpdp_consent_at: row.consent_given ? row.created_at : null,
      deletion_status: null,
      deleted_at: null,
    };
  }

  throw dpdpResult.error;
}

async function fetchOrdersForExport(
  supabase: SupabaseClient<Database>,
  customerId: string,
  datasetSince: string | null,
): Promise<OrderExportRow[]> {
  const buildQuery = (select: string) => {
    let query = supabase
      .from("orders")
      .select(select)
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false });

    if (datasetSince) {
      query = query.gt("created_at", datasetSince);
    }

    return query;
  };

  const withPayment = await buildQuery(ORDER_SELECT_WITH_PAYMENT);

  if (!withPayment.error) {
    return (withPayment.data ?? []) as unknown as OrderExportRow[];
  }

  if (isMissingColumnError(withPayment.error, "payment_method")) {
    if (process.env.NODE_ENV === "development") {
      console.warn(
        "[DPDP EXPORT] payment_method column missing — using legacy fallback. Run npm run db:migrate:payment-method",
      );
    }

    const legacyResult = await buildQuery(ORDER_SELECT_LEGACY);
    if (legacyResult.error) throw legacyResult.error;
    return (legacyResult.data ?? []) as unknown as OrderExportRow[];
  }

  throw withPayment.error;
}

export async function exportCustomerData(customerId: string) {
  const state = await getCustomerDpdpState(customerId, { reactivate: true });
  if (!state) return null;

  if (isEffectivelyDeleted(state)) {
    return buildDeletedExport(customerId, state.lastDeletedAt);
  }

  const supabase = createServiceClient();
  const customer = await fetchCustomerForExport(supabase, customerId);
  if (!customer) return null;

  const datasetSince = state.lastDeletedAt;
  const orders = await fetchOrdersForExport(supabase, customerId, datasetSince);

  const { data: conversations, error: conversationsError } = await supabase
    .from("conversations")
    .select("id, created_at, last_message_at")
    .eq("customer_id", customerId);

  if (conversationsError) throw conversationsError;

  const conversationIds = (conversations ?? []).map((row) => row.id);
  let messages: {
    id: string;
    conversation_id: string | null;
    sender_type: string;
    content: string;
    created_at: string;
  }[] = [];

  if (conversationIds.length > 0) {
    let messagesQuery = supabase
      .from("messages")
      .select("id, conversation_id, sender_type, content, created_at")
      .in("conversation_id", conversationIds)
      .order("created_at", { ascending: true });

    if (datasetSince) {
      messagesQuery = messagesQuery.gt("created_at", datasetSince);
    }

    const { data: messageRows, error: messagesError } = await messagesQuery;
    if (messagesError) throw messagesError;
    messages = messageRows ?? [];
  }

  const profileName = customer.name;
  const profilePhone = customer.phone?.startsWith("deleted_") ? null : customer.phone;
  const profileAddress = customer.address;

  return {
    exportedAt: new Date().toISOString(),
    effectiveStatus: state.effectiveStatus,
    deletionStatus: state.storedStatus,
    lastDeletedAt: state.lastDeletedAt,
    datasetSince,
    newDataSinceDeletion: state.newDataSinceDeletion,
    profile: {
      id: customer.id,
      name: profileName,
      phone: profilePhone,
      address: profileAddress,
      orderCount: customer.order_count,
      totalSpent: customer.total_spent,
      dpdpConsent: customer.dpdp_consent ?? false,
      dpdpConsentAt: customer.dpdp_consent_at ?? null,
      memberSince: customer.created_at,
    },
    addresses: profileAddress
      ? [{ type: "delivery", address: profileAddress }]
      : [],
    orders: orders.map((order) => ({
      id: order.id,
      status: order.status,
      totalAmount: order.total_amount,
      deliveryFee: order.delivery_fee,
      paymentMethod: resolvePaymentMethod({
        payment_method: order.payment_method,
        payment_utr: order.payment_utr,
        notes: order.notes,
      }),
      paymentStatus: order.payment_status,
      paymentReference: order.payment_utr,
      deliveryAddress: order.delivery_address,
      shipmentStatus: order.shipment_status,
      trackingId: order.tracking_id,
      createdAt: order.created_at,
      updatedAt: order.updated_at,
    })),
    chatHistory: messages.map((message) => ({
      id: message.id,
      conversationId: message.conversation_id,
      senderType: message.sender_type,
      content: message.content,
      createdAt: message.created_at,
    })),
  };
}
