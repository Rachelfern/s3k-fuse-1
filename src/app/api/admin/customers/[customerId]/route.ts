import { NextResponse } from "next/server";
import {
  approveCustomerDeletion,
  fetchCustomerDpdpInfo,
  rejectCustomerDeletion,
} from "@/lib/dpdp/customer-data";
import { fetchDpdpAuditLog } from "@/lib/dpdp/audit";
import { requireAdminUser } from "@/lib/admin/require-admin-user";
import { diagnoseSupabaseError } from "@/lib/supabase/errors";

interface RouteContext {
  params: Promise<{ customerId: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const { user } = await requireAdminUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { customerId } = await context.params;

  try {
    const [customer, auditLog] = await Promise.all([
      fetchCustomerDpdpInfo(customerId),
      fetchDpdpAuditLog(customerId),
    ]);

    if (!customer) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    return NextResponse.json({ customer, auditLog });
  } catch (error) {
    console.error("[admin/customers/[customerId]] fetch failed:", error);
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

  const { customerId } = await context.params;

  let body: { action?: "approve_deletion" | "reject_deletion" };
  try {
    body = (await request.json()) as {
      action?: "approve_deletion" | "reject_deletion";
    };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (
    body.action !== "approve_deletion" &&
    body.action !== "reject_deletion"
  ) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  try {
    const result =
      body.action === "approve_deletion"
        ? await approveCustomerDeletion(customerId, { adminUserId: user.id })
        : await rejectCustomerDeletion(customerId);

    if (!result.ok) {
      const message =
        result.reason === "not_found"
          ? "Customer not found"
          : result.reason === "already_deleted"
            ? "Customer data has already been deleted"
            : "No pending deletion request";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("[admin/customers/[customerId]] update failed:", error);
    return NextResponse.json(
      { error: diagnoseSupabaseError(error) },
      { status: 500 },
    );
  }
}
