import { createServiceClient } from "@/lib/supabase/service-client";
import { isMissingColumnError } from "@/lib/supabase/errors";
import { markPaymentRetryAwaitingReview } from "@/lib/orders/verify-payment";
import { notifyCustomerOfPaymentRetrySubmitted, notifyCustomerOfPaymentSubmitted } from "@/lib/orders/payment-retry-flow";

export const PAYMENT_SCREENSHOT_BUCKET = "payment-screenshots";

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

export function validatePaymentScreenshotFile(file: File): string | null {
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return "Only JPEG, PNG, or WebP images are allowed.";
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return "Image must be 5 MB or smaller.";
  }
  return null;
}

function extensionForMime(mime: string): string {
  switch (mime) {
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    default:
      return "jpg";
  }
}

export function buildPaymentScreenshotPath(input: {
  customerId: string;
  orderId: string;
  mimeType: string;
}): string {
  const ext = extensionForMime(input.mimeType);
  const timestamp = Date.now();
  return `${input.customerId}/${input.orderId}/${timestamp}.${ext}`;
}

export async function uploadPaymentScreenshot(input: {
  customerId: string;
  orderId: string;
  file: File | Blob;
  mimeType: string;
}): Promise<{ path: string; signedUrl: string }> {
  const supabase = createServiceClient();
  const path = buildPaymentScreenshotPath({
    customerId: input.customerId,
    orderId: input.orderId,
    mimeType: input.mimeType,
  });

  const buffer = Buffer.from(await input.file.arrayBuffer());

  const { error: uploadError } = await supabase.storage
    .from(PAYMENT_SCREENSHOT_BUCKET)
    .upload(path, buffer, {
      contentType: input.mimeType,
      upsert: true,
    });

  if (uploadError) throw uploadError;

  const { data: signed, error: signError } = await supabase.storage
    .from(PAYMENT_SCREENSHOT_BUCKET)
    .createSignedUrl(path, 60 * 60 * 24 * 7);

  if (signError) throw signError;

  return {
    path,
    signedUrl: signed.signedUrl,
  };
}

export async function getPaymentScreenshotSignedUrl(
  path: string,
  expiresInSeconds = 3600,
): Promise<string | null> {
  if (!path.trim()) return null;

  const supabase = createServiceClient();
  const { data, error } = await supabase.storage
    .from(PAYMENT_SCREENSHOT_BUCKET)
    .createSignedUrl(path, expiresInSeconds);

  if (error) {
    console.error("[STORAGE] Failed to sign payment screenshot URL:", error);
    return null;
  }

  return data.signedUrl;
}

export async function linkPaymentScreenshotToOrder(input: {
  orderId: string;
  customerId: string;
  path: string;
  signedUrl: string;
}): Promise<void> {
  const supabase = createServiceClient();

  const { data: order, error: fetchError } = await supabase
    .from("orders")
    .select(
      "customer_id, payment_status, payment_method, total_amount, payment_retry_submitted_at",
    )
    .eq("id", input.orderId)
    .maybeSingle();

  if (fetchError) throw fetchError;
  if (!order) throw new Error("Order not found.");
  if (order.customer_id !== input.customerId) {
    throw new Error("Order does not belong to this customer.");
  }

  const now = new Date().toISOString();
  const updatePayload: {
    payment_screenshot_path: string;
    payment_screenshot_url: string;
    payment_screenshot_uploaded_at: string;
    payment_status?: "retry_submitted";
    payment_retry_submitted_at?: string;
  } = {
    payment_screenshot_path: input.path,
    payment_screenshot_url: input.signedUrl,
    payment_screenshot_uploaded_at: now,
  };

  if (order.payment_method === "upi" && order.payment_status === "rejected") {
    updatePayload.payment_status = "retry_submitted";
    updatePayload.payment_retry_submitted_at = now;
  }

  const { error: updateError } = await supabase
    .from("orders")
    .update(updatePayload)
    .eq("id", input.orderId);

  if (updateError) {
    if (
      isMissingColumnError(updateError, "payment_screenshot_path") ||
      isMissingColumnError(updateError, "payment_screenshot_url") ||
      isMissingColumnError(updateError, "payment_screenshot_uploaded_at")
    ) {
      throw new Error(
        "Payment screenshot storage is not configured. Run supabase/migrations/20250623140000_ai_ops_payment_screenshots.sql",
      );
    }
    throw updateError;
  }

  if (
    order.payment_method === "upi" &&
    (order.payment_status === "rejected" || order.payment_status === "retry_submitted")
  ) {
    await markPaymentRetryAwaitingReview(input.orderId);
  }

  if (order.payment_method === "upi") {
    if (order.payment_retry_submitted_at) {
      await notifyCustomerOfPaymentRetrySubmitted({
        orderId: input.orderId,
        totalAmount: Number(order.total_amount),
      });
    } else {
      await notifyCustomerOfPaymentSubmitted({
        orderId: input.orderId,
        totalAmount: Number(order.total_amount),
      });
    }
  }
}
