import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingColumnError } from "@/lib/supabase/errors";
import type { Database } from "@/lib/types";

export interface CustomerConsentStatus {
  consented: boolean;
  consentAt: string | null;
}

export async function fetchCustomerConsentForRestore(
  supabase: SupabaseClient<Database>,
  customerId: string,
): Promise<CustomerConsentStatus> {
  const dpdpResult = await supabase
    .from("customers")
    .select("dpdp_consent, dpdp_consent_at")
    .eq("id", customerId)
    .maybeSingle();

  if (!dpdpResult.error) {
    return {
      consented: dpdpResult.data?.dpdp_consent ?? false,
      consentAt: dpdpResult.data?.dpdp_consent_at ?? null,
    };
  }

  if (
    isMissingColumnError(dpdpResult.error, "dpdp_consent") ||
    isMissingColumnError(dpdpResult.error, "dpdp_consent_at")
  ) {
    const legacyResult = await supabase
      .from("customers")
      .select("consent_given, created_at")
      .eq("id", customerId)
      .maybeSingle();

    if (legacyResult.error) throw legacyResult.error;

    const consented = legacyResult.data?.consent_given ?? false;
    return {
      consented,
      consentAt: consented ? (legacyResult.data?.created_at ?? null) : null,
    };
  }

  throw dpdpResult.error;
}
