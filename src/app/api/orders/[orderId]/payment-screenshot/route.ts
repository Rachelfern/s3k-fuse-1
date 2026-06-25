import { NextResponse } from "next/server";
import {
  linkPaymentScreenshotToOrder,
  uploadPaymentScreenshot,
  validatePaymentScreenshotFile,
} from "@/lib/storage/payment-screenshots";
import { diagnoseSupabaseError } from "@/lib/supabase/errors";

interface RouteContext {
  params: Promise<{ orderId: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  const { orderId } = await context.params;

  if (!orderId?.trim()) {
    return NextResponse.json({ error: "Order ID is required" }, { status: 400 });
  }

  try {
    const formData = await request.formData();
    const customerId = formData.get("customerId")?.toString().trim();
    const file = formData.get("file");

    if (!customerId) {
      return NextResponse.json(
        { error: "customerId is required" },
        { status: 400 },
      );
    }

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }

    const validationError = validatePaymentScreenshotFile(file);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const { path, signedUrl } = await uploadPaymentScreenshot({
      customerId,
      orderId,
      file,
      mimeType: file.type,
    });

    await linkPaymentScreenshotToOrder({
      orderId,
      customerId,
      path,
      signedUrl,
    });

    return NextResponse.json({
      ok: true,
      path,
      url: signedUrl,
    });
  } catch (error) {
    console.error("[orders/payment-screenshot] upload failed:", { orderId, error });
    return NextResponse.json(
      { error: diagnoseSupabaseError(error) },
      { status: 500 },
    );
  }
}
