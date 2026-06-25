import { NextResponse } from "next/server";
import { requestCustomerDeletion } from "@/lib/dpdp/customer-data";
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
    const result = await requestCustomerDeletion(customerId);

    if (!result.ok) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      alreadyPending: "alreadyPending" in result ? result.alreadyPending : false,
      alreadyDeleted: "alreadyDeleted" in result ? result.alreadyDeleted : false,
    });
  } catch (error) {
    console.error("[customer/deletion-request] failed:", error);
    return NextResponse.json(
      { error: diagnoseSupabaseError(error) },
      { status: 500 },
    );
  }
}
