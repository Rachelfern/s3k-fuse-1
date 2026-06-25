import { NextResponse } from "next/server";
import {
  fetchAdminOrderDetail,
  updateAdminOrder,
  OrderStateValidationError,
  type OrderUpdate,
} from "@/lib/admin/order-detail";
import { requireAdminUser } from "@/lib/admin/require-admin-user";
import { diagnoseSupabaseError } from "@/lib/supabase/errors";

interface RouteContext {
  params: Promise<{ orderId: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const { user } = await requireAdminUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { orderId } = await context.params;

  if (!orderId?.trim()) {
    return NextResponse.json({ error: "Order ID is required" }, { status: 400 });
  }

  try {
    const order = await fetchAdminOrderDetail(orderId);

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    return NextResponse.json({ order });
  } catch (error) {
    console.error("[admin/orders/[orderId]] fetch failed:", { orderId, error });
    return NextResponse.json(
      { error: diagnoseSupabaseError(error) },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const { user } = await requireAdminUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { orderId } = await context.params;

  if (!orderId?.trim()) {
    return NextResponse.json({ error: "Order ID is required" }, { status: 400 });
  }

  let fields: OrderUpdate;
  try {
    fields = (await request.json()) as OrderUpdate;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!fields || Object.keys(fields).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  try {
    await updateAdminOrder(orderId, fields);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof OrderStateValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("[admin/orders/[orderId]] update failed:", { orderId, error });
    return NextResponse.json(
      { error: diagnoseSupabaseError(error) },
      { status: 500 },
    );
  }
}
