import { NextResponse } from "next/server";
import { recordCustomerConsent } from "@/lib/dpdp/customer-data";
import { diagnoseSupabaseError } from "@/lib/supabase/errors";

export async function POST(request: Request) {
  let body: { customerId?: string };
  try {
    body = (await request.json()) as { customerId?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const customerId = body.customerId?.trim();
  if (!customerId) {
    return NextResponse.json(
      { error: "customerId is required" },
      { status: 400 },
    );
  }

  try {
    const result = await recordCustomerConsent(customerId);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[customer/consent] failed:", error);
    return NextResponse.json(
      { error: diagnoseSupabaseError(error) },
      { status: 500 },
    );
  }
}
