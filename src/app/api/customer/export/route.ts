import { NextResponse } from "next/server";
import { exportCustomerData } from "@/lib/dpdp/export-data";
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
    const data = await exportCustomerData(customerId);

    if (!data) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    const filename = `my-data-${customerId.slice(0, 8)}.json`;

    return new NextResponse(JSON.stringify(data, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("[customer/export] failed:", error);
    return NextResponse.json(
      { error: diagnoseSupabaseError(error) },
      { status: 500 },
    );
  }
}
