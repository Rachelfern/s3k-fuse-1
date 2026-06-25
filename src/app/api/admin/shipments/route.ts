import { NextResponse } from "next/server";
import {
  fetchAdminShipments,
  updateShipmentStatus,
  OrderStateValidationError,
} from "@/lib/admin/shipments-list";
import { requireAdminUser } from "@/lib/admin/require-admin-user";
import { diagnoseSupabaseError } from "@/lib/supabase/errors";
import type { ShipmentStatus } from "@/lib/types";

const VALID_STATUSES = new Set<ShipmentStatus>([
  "packed",
  "in_transit",
  "delivered",
]);

export async function GET() {
  const { user } = await requireAdminUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const shipments = await fetchAdminShipments();
    return NextResponse.json({ shipments });
  } catch (error) {
    console.error("[admin/shipments] fetch failed:", error);
    return NextResponse.json(
      { error: diagnoseSupabaseError(error) },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  const { user } = await requireAdminUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { orderId?: string; status?: string };
  try {
    body = (await request.json()) as { orderId?: string; status?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { orderId, status } = body;

  if (!orderId || !status || !VALID_STATUSES.has(status as ShipmentStatus)) {
    return NextResponse.json(
      { error: "orderId and a valid shipment status are required" },
      { status: 400 },
    );
  }

  try {
    await updateShipmentStatus(orderId, status as ShipmentStatus);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof OrderStateValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("[admin/shipments] update failed:", error);
    return NextResponse.json(
      { error: diagnoseSupabaseError(error) },
      { status: 500 },
    );
  }
}
