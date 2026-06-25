import { NextResponse } from "next/server";
import {
  fetchReturnRequestsForOrder,
} from "@/lib/orders/return-management-service";
import { createServiceClient } from "@/lib/supabase/service-client";
import { diagnoseSupabaseError } from "@/lib/supabase/errors";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const orderId = searchParams.get("orderId")?.trim();
  const requestId = searchParams.get("requestId")?.trim();
  const customerId = searchParams.get("customerId")?.trim();

  if (!customerId) {
    return NextResponse.json({ error: "customerId is required" }, { status: 400 });
  }

  try {
    if (requestId) {
      const supabase = createServiceClient();
      const { data, error } = await supabase
        .from("return_requests")
        .select("*")
        .eq("id", requestId)
        .eq("customer_id", customerId)
        .maybeSingle();

      if (error) throw error;
      return NextResponse.json({ returnRequest: data });
    }

    if (!orderId) {
      return NextResponse.json(
        { error: "orderId or requestId is required" },
        { status: 400 },
      );
    }

    const returns = await fetchReturnRequestsForOrder(orderId, customerId);
    return NextResponse.json({ returns });
  } catch (error) {
    console.error("[customer/return-requests] fetch failed:", error);
    return NextResponse.json(
      { error: diagnoseSupabaseError(error) },
      { status: 500 },
    );
  }
}
