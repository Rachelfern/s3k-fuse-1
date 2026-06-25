import { createOrder, InsufficientStockError, type PaymentMethod } from "@/lib/orders/create-order";
import { describeRazorpayConfig } from "@/lib/payments/razorpay-config";
import { verifyRazorpayPaymentSignature } from "@/lib/payments/razorpay-server";
import { diagnoseSupabaseError } from "@/lib/supabase/errors";
import { NextResponse } from "next/server";

type OrderRequestBody = {
  customerId?: string;
  conversationId?: string;
  checkout?: {
    name?: string;
    phone?: string;
    address?: string;
  };
  items?: {
    productId?: string;
    quantity?: number;
    unitPrice?: number;
  }[];
  subtotal?: number;
  payment?: {
    method?: PaymentMethod;
    transactionReference?: string;
    upiId?: string;
    razorpayPaymentId?: string;
    razorpayOrderId?: string;
    razorpaySignature?: string;
    upiAwaitingVerification?: boolean;
  };
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as OrderRequestBody;

    const name = body.checkout?.name?.trim();
    const phone = body.checkout?.phone?.trim();
    const address = body.checkout?.address?.trim();
    const subtotal = body.subtotal;
    const method = body.payment?.method ?? "upi";
    const transactionReference = body.payment?.transactionReference?.trim();
    const upiId = body.payment?.upiId?.trim();
    const razorpayPaymentId = body.payment?.razorpayPaymentId?.trim();
    const razorpayOrderId = body.payment?.razorpayOrderId?.trim();
    const razorpaySignature = body.payment?.razorpaySignature?.trim();
    const upiAwaitingVerification = body.payment?.upiAwaitingVerification === true;

    if (!name || !phone || !address) {
      return NextResponse.json(
        { error: "Checkout name, phone, and address are required." },
        { status: 400 },
      );
    }

    if (typeof subtotal !== "number" || subtotal <= 0) {
      return NextResponse.json(
        { error: "A valid subtotal is required." },
        { status: 400 },
      );
    }

    if (
      method !== "cod" &&
      !upiAwaitingVerification &&
      !transactionReference &&
      !razorpayPaymentId
    ) {
      return NextResponse.json(
        { error: "Payment must be completed before placing the order." },
        { status: 400 },
      );
    }

    if (razorpayPaymentId) {
      if (!razorpayOrderId || !razorpaySignature) {
        return NextResponse.json(
          { error: "Razorpay payment verification data is required." },
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
    }

    const items = (body.items ?? [])
      .filter(
        (item): item is { productId: string; quantity: number; unitPrice: number } =>
          Boolean(item.productId) &&
          typeof item.quantity === "number" &&
          item.quantity > 0 &&
          typeof item.unitPrice === "number" &&
          item.unitPrice >= 0,
      )
      .map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      }));

    if (items.length === 0) {
      return NextResponse.json(
        { error: "At least one cart item is required." },
        { status: 400 },
      );
    }

    console.log("[CHECKOUT] Order placement started", {
      paymentMethod: method,
      itemCount: items.length,
      subtotal,
      razorpayConfigured: describeRazorpayConfig().ready,
    });

    const result = await createOrder({
      customerId: body.customerId,
      conversationId: body.conversationId,
      checkout: { name, phone, address },
      items,
      subtotal,
      payment: {
        method,
        transactionReference,
        upiId,
        razorpayPaymentId,
        razorpayOrderId,
        upiAwaitingVerification,
      },
    });

    console.log("[CHECKOUT] Order created", {
      paymentMethod: method,
      orderId: result.orderId,
      status: result.status,
      totalAmount: result.totalAmount,
      warnings: result.warnings,
    });

    return NextResponse.json({
      orderId: result.orderId,
      status: result.status,
      totalAmount: result.totalAmount,
      customerId: result.customerId,
      warnings: result.warnings,
    });
  } catch (error) {
    if (error instanceof InsufficientStockError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("[ORDER] Create failed:", error);
    return NextResponse.json(
      { error: diagnoseSupabaseError(error) },
      { status: 500 },
    );
  }
}
