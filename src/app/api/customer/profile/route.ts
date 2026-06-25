import { NextResponse } from "next/server";
import { fetchCustomerDpdpProfile } from "@/lib/dpdp/customer-data";
import { diagnoseSupabaseError } from "@/lib/supabase/errors";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const customerId = searchParams.get("customerId")?.trim();

  if (!customerId) {
    return NextResponse.json(
      { error: "customerId is required" },
      { status: 400 },
    );
  }

  try {
    const profile = await fetchCustomerDpdpProfile(customerId);

    if (!profile) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    const { customer, state } = profile;

    return NextResponse.json({
      dpdpConsent: customer.dpdp_consent,
      dpdpConsentAt: customer.dpdp_consent_at,
      deletionStatus: state.effectiveStatus,
      storedDeletionStatus: state.storedStatus,
      deletedAt: state.lastDeletedAt,
      hasNewPersonalData: state.hasNewPersonalData,
      newDataSinceDeletion: state.newDataSinceDeletion,
    });
  } catch (error) {
    console.error("[customer/profile] failed:", error);
    return NextResponse.json(
      { error: diagnoseSupabaseError(error) },
      { status: 500 },
    );
  }
}
