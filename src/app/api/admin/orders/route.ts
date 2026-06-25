import { fetchAdminOrders } from "@/lib/admin/orders-list";
import { ORDER_FILTER_TABS, type OrderFilterValue } from "@/lib/admin/order-utils";
import { diagnoseSupabaseError } from "@/lib/supabase/errors";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const VALID_FILTERS = new Set<OrderFilterValue>(
  ORDER_FILTER_TABS.map((tab) => tab.value),
);

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const rawFilter = searchParams.get("status") ?? "all";
  const statusFilter = VALID_FILTERS.has(rawFilter as OrderFilterValue)
    ? (rawFilter as OrderFilterValue)
    : "all";

  try {
    const orders = await fetchAdminOrders(statusFilter);
    return NextResponse.json({ orders });
  } catch (error) {
    console.error("[admin/orders] fetch failed:", error);
    return NextResponse.json(
      { error: diagnoseSupabaseError(error) },
      { status: 500 },
    );
  }
}
