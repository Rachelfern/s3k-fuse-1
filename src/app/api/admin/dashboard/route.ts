import { NextResponse } from "next/server";
import { fetchDashboardMetrics } from "@/lib/admin/dashboard-metrics";
import { diagnoseSupabaseError } from "@/lib/supabase/errors";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const data = await fetchDashboardMetrics();
    console.log("[admin/dashboard] success", {
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
      totalOrders: data.metrics.totalOrders,
      recentOrders: data.recentOrders.length,
    });
    return NextResponse.json(data);
  } catch (error) {
    console.error("[admin/dashboard] fetch failed:", error);
    return NextResponse.json(
      { error: diagnoseSupabaseError(error) },
      { status: 500 },
    );
  }
}
