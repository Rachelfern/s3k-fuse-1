import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/admin/require-admin-user";
import { getPaymentScreenshotSignedUrl } from "@/lib/storage/payment-screenshots";
import { createServiceClient } from "@/lib/supabase/service-client";
import { diagnoseSupabaseError, isMissingColumnError } from "@/lib/supabase/errors";

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
    const supabase = createServiceClient();
    const { data: order, error } = await supabase
      .from("orders")
      .select("payment_screenshot_path, payment_screenshot_uploaded_at")
      .eq("id", orderId)
      .maybeSingle();

    if (error) {
      if (
        isMissingColumnError(error, "payment_screenshot_path") ||
        isMissingColumnError(error, "payment_screenshot_uploaded_at")
      ) {
        return NextResponse.json({ url: null, uploadedAt: null });
      }
      throw error;
    }
    if (!order?.payment_screenshot_path) {
      return NextResponse.json({ url: null, uploadedAt: null });
    }

    const url = await getPaymentScreenshotSignedUrl(order.payment_screenshot_path);

    return NextResponse.json({
      url,
      uploadedAt: order.payment_screenshot_uploaded_at,
    });
  } catch (error) {
    console.error("[admin/payment-screenshot] failed:", { orderId, error });
    return NextResponse.json(
      { error: diagnoseSupabaseError(error) },
      { status: 500 },
    );
  }
}
