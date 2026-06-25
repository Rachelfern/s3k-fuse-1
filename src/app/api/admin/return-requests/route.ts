import { NextResponse } from "next/server";
import {
  fetchReturnMetrics,
  fetchReturnRequestsByStatus,
} from "@/lib/orders/return-management-service";
import type { ReturnWorkflowStatus } from "@/lib/orders/return-status-timeline";
import { requireAdminUser } from "@/lib/admin/require-admin-user";
import { diagnoseSupabaseError } from "@/lib/supabase/errors";

const VALID_STATUSES: ReturnWorkflowStatus[] = [
  "pending",
  "approved",
  "pickup_scheduled",
  "picked_up",
  "refunded",
  "rejected",
];

export async function GET(request: Request) {
  const { user } = await requireAdminUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const statusParam = searchParams.get("status");
  const includeMetrics = searchParams.get("metrics") === "true";

  try {
    const status =
      statusParam && VALID_STATUSES.includes(statusParam as ReturnWorkflowStatus)
        ? (statusParam as ReturnWorkflowStatus)
        : undefined;

    const [returns, metrics] = await Promise.all([
      fetchReturnRequestsByStatus(status),
      includeMetrics ? fetchReturnMetrics() : Promise.resolve(null),
    ]);

    return NextResponse.json({ returns, metrics });
  } catch (error) {
    console.error("[admin/return-requests] fetch failed:", error);
    return NextResponse.json(
      { error: diagnoseSupabaseError(error) },
      { status: 500 },
    );
  }
}
