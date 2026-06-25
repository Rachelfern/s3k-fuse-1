import {
  isRazorpayServerConfigured,
  verifyRazorpayPaymentSignature,
} from "@/lib/payments/razorpay-server";
import { NextResponse } from "next/server";

type VerifyPaymentRequestBody = {
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  razorpaySignature?: string;
};

export async function POST(request: Request) {
  if (!isRazorpayServerConfigured()) {
    return NextResponse.json(
      { error: "Razorpay is not configured." },
      { status: 503 },
    );
  }

  try {
    const body = (await request.json()) as VerifyPaymentRequestBody;
    const razorpayOrderId = body.razorpayOrderId?.trim();
    const razorpayPaymentId = body.razorpayPaymentId?.trim();
    const razorpaySignature = body.razorpaySignature?.trim();

    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return NextResponse.json(
        {
          error:
            "razorpayOrderId, razorpayPaymentId, and razorpaySignature are required.",
        },
        { status: 400 },
      );
    }

    const verified = verifyRazorpayPaymentSignature({
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
    });

    if (!verified) {
      return NextResponse.json(
        { error: "Payment verification failed." },
        { status: 400 },
      );
    }

    return NextResponse.json({ verified: true });
  } catch (error) {
    console.error("[PAYMENT] Razorpay verification failed:", error);
    const message =
      error instanceof Error ? error.message : "Payment verification failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
