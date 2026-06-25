import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/admin/require-admin-user";
import {
  rejectOrderPayment,
  verifyOrderPayment,
} from "@/lib/orders/verify-payment";
import { diagnoseSupabaseError } from "@/lib/supabase/errors";

interface RouteContext {
  params: Promise<{ orderId: string }>;
}

type Body = {
  action?: "verify" | "reject";
  rejectReason?: string;
};

export async function POST(request: Request, context: RouteContext) {
  const { user } = await requireAdminUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { orderId } = await context.params;

  if (!orderId?.trim()) {
    return NextResponse.json({ error: "Order ID is required" }, { status: 400 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.action !== "verify" && body.action !== "reject") {
    return NextResponse.json(
      { error: "action must be 'verify' or 'reject'" },
      { status: 400 },
    );
  }

  if (body.action === "reject") {
    const rejectReason = body.rejectReason?.trim();
    if (!rejectReason) {
      return NextResponse.json(
        { error: "rejectReason is required when rejecting payment" },
        { status: 400 },
      );
    }
  }

  try {
    if (body.action === "verify") {
      await verifyOrderPayment(orderId);
    } else {
      await rejectOrderPayment(orderId, body.rejectReason!.trim());
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[admin/orders/payment-verification] failed:", {
      orderId,
      action: body.action,
      error,
    });

    const message = error instanceof Error ? error.message : diagnoseSupabaseError(error);
    const status = message.includes("required") || message.includes("Only orders") ? 400 : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
