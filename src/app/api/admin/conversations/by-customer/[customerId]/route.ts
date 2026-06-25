import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/admin/require-admin-user";
import { diagnoseSupabaseError } from "@/lib/supabase/errors";
import { createServiceClient } from "@/lib/supabase/service-client";
import type { Message } from "@/lib/types";

interface RouteContext {
  params: Promise<{ customerId: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const { user } = await requireAdminUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { customerId } = await context.params;

  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("conversations")
      .select(
        "id, customer_id, customers ( name, phone, dpdp_consent, dpdp_consent_at, deletion_status )",
      )
      .eq("customer_id", customerId)
      .order("last_message_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (!data?.id || !data.customer_id) {
      return NextResponse.json({ conversation: null });
    }

    return NextResponse.json({
      conversation: {
        id: data.id,
        customer_id: data.customer_id,
        customer_name: data.customers?.name ?? null,
        customer_phone: data.customers?.phone ?? "",
        dpdp_consent: data.customers?.dpdp_consent ?? false,
        dpdp_consent_at: data.customers?.dpdp_consent_at ?? null,
        deletion_status: data.customers?.deletion_status ?? null,
      },
    });
  } catch (error) {
    console.error("[admin/conversations/by-customer] fetch failed:", error);
    return NextResponse.json(
      { error: diagnoseSupabaseError(error) },
      { status: 500 },
    );
  }
}
