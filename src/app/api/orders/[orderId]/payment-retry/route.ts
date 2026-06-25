import { NextResponse } from "next/server";
import {
  defaultRetryPaymentMethod,
  resubmitOrderPayment,
  type ResubmitPaymentPayload,
} from "@/lib/orders/resubmit-order-payment";
import { resolvePaymentMethod } from "@/lib/orders/order-lifecycle";
import { diagnoseSupabaseError } from "@/lib/supabase/errors";
import type { PaymentMethod } from "@/lib/types";

interface RouteContext {
  params: Promise<{ orderId: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  const { orderId } = await context.params;
  const customerId = new URL(request.url).searchParams.get("customerId")?.trim();

  if (!orderId?.trim()) {
    return NextResponse.json({ error: "Order ID is required" }, { status: 400 });
  }

  if (!customerId) {
    return NextResponse.json({ error: "customerId is required" }, { status: 400 });
  }

  try {
    const { createServiceClient } = await import("@/lib/supabase/service-client");
    const supabase = createServiceClient();

    const { data: order, error } = await supabase
      .from("orders")
      .select(
        `id, status, total_amount, delivery_fee, payment_status, payment_method, payment_utr, notes,
         payment_rejection_reason, payment_rejected_at, delivery_address,
         customers ( name, phone, address ),
         carts ( cart_items ( quantity, price_snapshot, products ( id, name_en, image_url ) ) )`,
      )
      .eq("id", orderId)
      .eq("customer_id", customerId)
      .maybeSingle();

    if (error) throw error;
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    if (order.payment_status !== "rejected") {
      return NextResponse.json(
        { error: "This order is not eligible for payment retry." },
        { status: 400 },
      );
    }

    const previousPaymentMethod = resolvePaymentMethod({
      payment_method: order.payment_method,
      payment_utr: order.payment_utr,
      notes: order.notes,
    });

    const customer = order.customers as {
      name: string | null;
      phone: string | null;
      address: string | null;
    } | null;

    const items =
      (
        order.carts as {
          cart_items: {
            quantity: number;
            price_snapshot: number;
            products: { id: string; name_en: string; image_url: string | null } | null;
          }[] | null;
        } | null
      )?.cart_items?.map((item) => ({
        productId: item.products?.id ?? "",
        name: item.products?.name_en ?? "Item",
        imageUrl: item.products?.image_url ?? null,
        quantity: item.quantity,
        unitPrice: Number(item.price_snapshot),
      })) ?? [];

    const subtotal = items.reduce(
      (sum, item) => sum + item.unitPrice * item.quantity,
      0,
    );

    return NextResponse.json({
      order: {
        id: order.id,
        status: order.status,
        totalAmount: Number(order.total_amount),
        deliveryFee: Number(order.delivery_fee),
        subtotal,
        paymentStatus: order.payment_status,
        previousPaymentMethod,
        suggestedPaymentMethod: defaultRetryPaymentMethod(previousPaymentMethod),
        rejectReason: order.payment_rejection_reason,
        rejectedAt: order.payment_rejected_at,
        deliveryAddress:
          order.delivery_address?.trim() ||
          customer?.address?.trim() ||
          null,
        customerName: customer?.name?.trim() || null,
        customerPhone: customer?.phone?.trim() || null,
        items,
      },
    });
  } catch (error) {
    console.error("[orders/payment-retry] GET failed:", { orderId, error });
    return NextResponse.json(
      { error: diagnoseSupabaseError(error) },
      { status: 500 },
    );
  }
}

type PostBody = {
  customerId?: string;
  payment?: ResubmitPaymentPayload;
};

function isPaymentMethod(value: unknown): value is PaymentMethod {
  return value === "upi" || value === "card" || value === "cod";
}

export async function POST(request: Request, context: RouteContext) {
  const { orderId } = await context.params;

  if (!orderId?.trim()) {
    return NextResponse.json({ error: "Order ID is required" }, { status: 400 });
  }

  let body: PostBody;
  try {
    body = (await request.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const customerId = body.customerId?.trim();
  if (!customerId) {
    return NextResponse.json({ error: "customerId is required" }, { status: 400 });
  }

  const payment = body.payment;
  if (!payment || !isPaymentMethod(payment.method)) {
    return NextResponse.json(
      { error: "payment.method must be 'upi', 'card', or 'cod'" },
      { status: 400 },
    );
  }

  try {
    const result = await resubmitOrderPayment({
      orderId,
      customerId,
      payment,
    });

    return NextResponse.json({
      ok: true,
      orderId: result.orderId,
      totalAmount: result.totalAmount,
      paymentStatus: result.paymentStatus,
      orderStatus: result.orderStatus,
      requiresScreenshot: result.requiresScreenshot,
    });
  } catch (error) {
    console.error("[orders/payment-retry] POST failed:", { orderId, error });
    const message = error instanceof Error ? error.message : diagnoseSupabaseError(error);
    const status =
      message.includes("not eligible") ||
      message.includes("belong") ||
      message.includes("required") ||
      message.includes("unavailable")
        ? 400
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
