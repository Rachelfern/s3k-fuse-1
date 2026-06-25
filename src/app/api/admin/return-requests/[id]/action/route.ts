import { NextResponse } from "next/server";
import { executeReturnAdminAction } from "@/lib/orders/return-management-service";
import type { ReturnAdminAction } from "@/lib/orders/return-status-timeline";
import { requireAdminUser } from "@/lib/admin/require-admin-user";
import { diagnoseSupabaseError } from "@/lib/supabase/errors";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const VALID_ACTIONS: ReturnAdminAction[] = [
  "approve",
  "reject",
  "schedule_pickup",
  "mark_picked_up",
  "process_refund",
];

type Body = {
  action?: ReturnAdminAction;
  rejectReason?: string;
};

export async function POST(request: Request, context: RouteContext) {
  const { user } = await requireAdminUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  if (!id?.trim()) {
    return NextResponse.json({ error: "Return request ID is required" }, { status: 400 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.action || !VALID_ACTIONS.includes(body.action)) {
    return NextResponse.json(
      { error: `action must be one of: ${VALID_ACTIONS.join(", ")}` },
      { status: 400 },
    );
  }

  try {
    const updated = await executeReturnAdminAction({
      requestId: id,
      action: body.action,
      rejectReason: body.rejectReason,
    });

    return NextResponse.json({ returnRequest: updated });
  } catch (error) {
    console.error("[admin/return-requests/action] failed:", {
      id,
      action: body.action,
      error,
    });

    const message =
      error instanceof Error ? error.message : diagnoseSupabaseError(error);

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
