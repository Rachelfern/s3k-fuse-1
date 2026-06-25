import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service-client";
import type { Database, DeletionStatus } from "@/lib/types";

export type EffectiveDpdpStatus = "active" | "pending_deletion" | "deleted";

export type NewDataSummary = {
  messageCount: number;
  orderCount: number;
  hasProfilePii: boolean;
  hasConsent: boolean;
  totalItems: number;
};

export type CustomerDpdpRow = {
  id: string;
  name: string | null;
  phone: string;
  address: string | null;
  dpdp_consent: boolean;
  dpdp_consent_at: string | null;
  deletion_status: DeletionStatus | string | null;
  deleted_at: string | null;
};

export type CustomerDpdpState = {
  effectiveStatus: EffectiveDpdpStatus;
  storedStatus: DeletionStatus | string | null;
  lastDeletedAt: string | null;
  newDataSinceDeletion: NewDataSummary | null;
  hasNewPersonalData: boolean;
};

function isAfter(iso: string | null | undefined, cutoff: string): boolean {
  if (!iso) return false;
  return new Date(iso).getTime() > new Date(cutoff).getTime();
}

function isAnonymizedPhone(phone: string | null | undefined): boolean {
  return phone?.startsWith("deleted_") ?? false;
}

function hasProfilePiiSinceDeletion(
  customer: CustomerDpdpRow,
  deletedAt: string,
): boolean {
  if (customer.name?.trim()) return true;
  if (customer.address?.trim()) return true;
  if (customer.dpdp_consent && isAfter(customer.dpdp_consent_at, deletedAt)) {
    return true;
  }
  if (!isAnonymizedPhone(customer.phone)) return true;
  return false;
}

async function measureNewDataSinceDeletion(
  supabase: SupabaseClient<Database>,
  customer: CustomerDpdpRow,
  deletedAt: string,
): Promise<NewDataSummary> {
  const hasProfilePii = hasProfilePiiSinceDeletion(customer, deletedAt);
  const hasConsent =
    customer.dpdp_consent && isAfter(customer.dpdp_consent_at, deletedAt);

  const { data: conversations, error: conversationsError } = await supabase
    .from("conversations")
    .select("id")
    .eq("customer_id", customer.id);

  if (conversationsError) throw conversationsError;

  const conversationIds = (conversations ?? []).map((row) => row.id);
  let messageCount = 0;

  if (conversationIds.length > 0) {
    const { count, error: messagesError } = await supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .in("conversation_id", conversationIds)
      .gt("created_at", deletedAt);

    if (messagesError) throw messagesError;
    messageCount = count ?? 0;
  }

  const { count: orderCount, error: ordersError } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("customer_id", customer.id)
    .gt("created_at", deletedAt);

  if (ordersError) throw ordersError;

  const profileItems =
    (hasProfilePii ? 1 : 0) + (hasConsent && !hasProfilePii ? 1 : 0);
  const totalItems = messageCount + (orderCount ?? 0) + profileItems;

  return {
    messageCount,
    orderCount: orderCount ?? 0,
    hasProfilePii,
    hasConsent,
    totalItems,
  };
}

export function computeEffectiveStatus(
  customer: CustomerDpdpRow,
  hasNewPersonalData: boolean,
): EffectiveDpdpStatus {
  if (customer.deletion_status === "pending_deletion") {
    return "pending_deletion";
  }

  if (customer.deleted_at) {
    return hasNewPersonalData ? "active" : "deleted";
  }

  if (customer.deletion_status === "deleted") {
    return hasNewPersonalData ? "active" : "deleted";
  }

  return "active";
}

export async function resolveCustomerDpdpState(
  customer: CustomerDpdpRow,
  options: { reactivate?: boolean } = {},
): Promise<CustomerDpdpState> {
  const supabase = createServiceClient();
  const lastDeletedAt = customer.deleted_at;

  let newDataSinceDeletion: NewDataSummary | null = null;
  let hasNewPersonalData = false;

  if (lastDeletedAt) {
    newDataSinceDeletion = await measureNewDataSinceDeletion(
      supabase,
      customer,
      lastDeletedAt,
    );
    hasNewPersonalData = newDataSinceDeletion.totalItems > 0;
  } else if (customer.deletion_status === "deleted") {
    hasNewPersonalData = false;
  } else {
    hasNewPersonalData =
      !!customer.name?.trim() ||
      !!customer.address?.trim() ||
      customer.dpdp_consent ||
      !isAnonymizedPhone(customer.phone);
  }

  const effectiveStatus = computeEffectiveStatus(customer, hasNewPersonalData);

  if (
    options.reactivate &&
    effectiveStatus === "active" &&
    customer.deletion_status === "deleted"
  ) {
    const { error } = await supabase
      .from("customers")
      .update({ deletion_status: null })
      .eq("id", customer.id);

    if (error) throw error;
  }

  return {
    effectiveStatus,
    storedStatus: customer.deletion_status,
    lastDeletedAt,
    newDataSinceDeletion,
    hasNewPersonalData,
  };
}

export async function getCustomerDpdpState(
  customerId: string,
  options: { reactivate?: boolean } = {},
): Promise<CustomerDpdpState | null> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("customers")
    .select(
      "id, name, phone, address, dpdp_consent, dpdp_consent_at, deletion_status, deleted_at",
    )
    .eq("id", customerId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return resolveCustomerDpdpState(data as CustomerDpdpRow, options);
}

export function isEffectivelyDeleted(state: CustomerDpdpState): boolean {
  return state.effectiveStatus === "deleted";
}

/** ISO timestamp bounding the current personal-data dataset for export/deletion. */
export function getCurrentDatasetSince(
  lastDeletedAt: string | null,
): string | null {
  return lastDeletedAt;
}
