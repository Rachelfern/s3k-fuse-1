import { recordDpdpAuditEvent } from "@/lib/dpdp/audit";
import {
  getCurrentDatasetSince,
  getCustomerDpdpState,
  isEffectivelyDeleted,
  resolveCustomerDpdpState,
  type CustomerDpdpRow,
} from "@/lib/dpdp/dataset-state";
import { createServiceClient } from "@/lib/supabase/service-client";
import { isMissingColumnError } from "@/lib/supabase/errors";

export {
  getCustomerDpdpState,
  isEffectivelyDeleted,
  type CustomerDpdpState,
  type EffectiveDpdpStatus,
  type NewDataSummary,
} from "@/lib/dpdp/dataset-state";

export async function recordCustomerConsent(customerId: string) {
  const supabase = createServiceClient();
  const consentAt = new Date().toISOString();

  const { error: updateError } = await supabase
    .from("customers")
    .update({
      dpdp_consent: true,
      dpdp_consent_at: consentAt,
      consent_given: true,
      deletion_status: null,
    })
    .eq("id", customerId);

  if (updateError) throw updateError;

  await recordDpdpAuditEvent(customerId, "consent_given", {
    consentAt,
    afterPreviousDeletion: true,
  });

  return { consentAt };
}

export async function requestCustomerDeletion(customerId: string) {
  const state = await getCustomerDpdpState(customerId, { reactivate: true });
  if (!state) return { ok: false as const, reason: "not_found" as const };

  if (isEffectivelyDeleted(state)) {
    return { ok: true as const, alreadyDeleted: true as const };
  }

  if (state.effectiveStatus === "pending_deletion") {
    return { ok: true as const, alreadyPending: true as const };
  }

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("customers")
    .update({ deletion_status: "pending_deletion" })
    .eq("id", customerId);

  if (error) throw error;

  await recordDpdpAuditEvent(customerId, "deletion_requested", {
    datasetSince: getCurrentDatasetSince(state.lastDeletedAt),
  });

  return { ok: true as const, alreadyPending: false as const };
}

export async function approveCustomerDeletion(
  customerId: string,
  options: { adminUserId?: string } = {},
) {
  const state = await getCustomerDpdpState(customerId);
  if (!state) return { ok: false as const, reason: "not_found" as const };

  if (isEffectivelyDeleted(state)) {
    return {
      ok: true as const,
      alreadyDeleted: true as const,
      deletedAt: state.lastDeletedAt,
    };
  }

  if (state.effectiveStatus !== "pending_deletion") {
    return { ok: false as const, reason: "not_pending" as const };
  }

  const { executeCustomerDeletionJob } = await import("@/lib/dpdp/deletion-job");

  try {
    const result = await executeCustomerDeletionJob(customerId, options);
    return { ok: true as const, ...result };
  } catch (error) {
    if (error instanceof Error && error.message.includes("No pending deletion")) {
      return { ok: false as const, reason: "not_pending" as const };
    }
    throw error;
  }
}

export async function rejectCustomerDeletion(customerId: string) {
  const state = await getCustomerDpdpState(customerId);
  if (!state) return { ok: false as const, reason: "not_found" as const };

  if (isEffectivelyDeleted(state)) {
    return { ok: false as const, reason: "already_deleted" as const };
  }

  if (state.effectiveStatus !== "pending_deletion") {
    return { ok: false as const, reason: "not_pending" as const };
  }

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("customers")
    .update({ deletion_status: null })
    .eq("id", customerId);

  if (error) throw error;

  return { ok: true as const };
}

export async function fetchCustomerDpdpInfo(customerId: string) {
  const supabase = createServiceClient();

  const dpdpResult = await supabase
    .from("customers")
    .select(
      "id, name, phone, address, dpdp_consent, dpdp_consent_at, deletion_status, deleted_at",
    )
    .eq("id", customerId)
    .maybeSingle();

  if (!dpdpResult.error) {
    return dpdpResult.data;
  }

  if (
    isMissingColumnError(dpdpResult.error, "dpdp_consent") ||
    isMissingColumnError(dpdpResult.error, "dpdp_consent_at") ||
    isMissingColumnError(dpdpResult.error, "deletion_status") ||
    isMissingColumnError(dpdpResult.error, "deleted_at")
  ) {
    const legacyResult = await supabase
      .from("customers")
      .select("id, name, phone, address, consent_given, created_at")
      .eq("id", customerId)
      .maybeSingle();

    if (legacyResult.error) throw legacyResult.error;
    if (!legacyResult.data) return null;

    return {
      id: legacyResult.data.id,
      name: legacyResult.data.name,
      phone: legacyResult.data.phone,
      address: legacyResult.data.address,
      dpdp_consent: legacyResult.data.consent_given ?? false,
      dpdp_consent_at: legacyResult.data.consent_given
        ? legacyResult.data.created_at
        : null,
      deletion_status: null,
      deleted_at: null,
    };
  }

  throw dpdpResult.error;
}

export async function fetchCustomerDpdpProfile(customerId: string) {
  const customer = await fetchCustomerDpdpInfo(customerId);
  if (!customer) return null;

  const state = await resolveCustomerDpdpStateWithReactivate(
    customer as CustomerDpdpRow,
  );

  return { customer, state };
}

async function resolveCustomerDpdpStateWithReactivate(customer: CustomerDpdpRow) {
  return resolveCustomerDpdpState(customer, { reactivate: true });
}

export async function fetchPendingDeletionRequests() {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("customers")
    .select("id, name, phone, dpdp_consent_at, created_at")
    .eq("deletion_status", "pending_deletion")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}
