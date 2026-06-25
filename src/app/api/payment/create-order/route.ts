import {
  createRazorpayOrder,
  isRazorpayServerConfigured,
} from "@/lib/payments/razorpay-server";
import { describeRazorpayConfig } from "@/lib/payments/razorpay-config";
import { NextResponse } from "next/server";

type CreateOrderRequestBody = {
  amountPaise?: number;
  receipt?: string;
};

export async function POST(request: Request) {
  if (!isRazorpayServerConfigured()) {
    return NextResponse.json(
      { error: "Razorpay is not configured." },
      { status: 503 },
    );
  }

  try {
    const body = (await request.json()) as CreateOrderRequestBody;
    const amountPaise = body.amountPaise;

    if (typeof amountPaise !== "number" || !Number.isInteger(amountPaise)) {
      return NextResponse.json(
        { error: "amountPaise must be an integer number of paise." },
        { status: 400 },
      );
    }

    const order = await createRazorpayOrder({
      amountPaise,
      receipt: body.receipt?.trim() || undefined,
    });

    console.log("[CHECKOUT] Razorpay order created", {
      razorpayOrderId: order.id,
      amountPaise: order.amount,
      currency: order.currency,
      config: describeRazorpayConfig(),
    });

    return NextResponse.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
    });
  } catch (error) {
    console.error("[PAYMENT] Razorpay order creation failed:", error);
    const message =
      error instanceof Error ? error.message : "Failed to create payment order.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
