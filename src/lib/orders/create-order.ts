import { formatOrderConfirmationMessage, formatUpiPendingOrderMessage } from "@/lib/chat/conversation-flows";
import { encodeOrderConfirmedIntent } from "@/lib/chat/quick-replies";
import { BUSINESS_ID } from "@/lib/demo";
import {
  deductInventoryForOrder,
  formatInsufficientStockMessage,
  validateOrderInventory,
} from "@/lib/inventory/inventory-service";
import { diagnoseSupabaseError } from "@/lib/supabase/errors";
import { createServiceClient } from "@/lib/supabase/service-client";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, OrderStatus, PaymentMethod, PaymentStatus } from "@/lib/types";

export const DEFAULT_DELIVERY_FEE = 40;

export type CreateOrderLineItem = {
  productId: string;
  quantity: number;
  unitPrice: number;
};

export type { PaymentMethod };

export type CreateOrderInput = {
  customerId?: string;
  conversationId?: string;
  checkout: {
    name: string;
    phone: string;
    address: string;
  };
  items: CreateOrderLineItem[];
  subtotal: number;
  payment: {
    method: PaymentMethod;
    transactionReference?: string;
    upiId?: string;
    razorpayPaymentId?: string;
    razorpayOrderId?: string;
    upiAwaitingVerification?: boolean;
  };
};

export type CreateOrderResult = {
  orderId: string;
  status: string;
  totalAmount: number;
  customerId: string;
  warnings?: string[];
};

export class InsufficientStockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InsufficientStockError";
  }
}

async function resolveCustomerId(
  supabase: SupabaseClient<Database>,
  input: CreateOrderInput,
): Promise<string> {
  const name = input.checkout.name.trim();
  const phone = input.checkout.phone.trim();
  const address = input.checkout.address.trim();

  if (input.customerId) {
    const { error } = await supabase
      .from("customers")
      .update({ name, phone, address })
      .eq("id", input.customerId);

    if (error) throw error;
    return input.customerId;
  }

  const { data, error } = await supabase
    .from("customers")
    .upsert(
      {
        business_id: BUSINESS_ID,
        phone,
        name,
        address,
        consent_given: true,
        dpdp_consent: true,
        dpdp_consent_at: new Date().toISOString(),
      },
      { onConflict: "business_id,phone" },
    )
    .select("id")
    .single();

  if (error) throw error;
  return data.id;
}

async function createConvertedCart(
  supabase: SupabaseClient<Database>,
  input: {
    customerId: string;
    conversationId?: string;
    items: CreateOrderLineItem[];
  },
): Promise<string> {
  await supabase
    .from("carts")
    .update({ status: "abandoned" })
    .eq("customer_id", input.customerId)
    .eq("status", "active");

  const { data: cart, error: cartError } = await supabase
    .from("carts")
    .insert({
      customer_id: input.customerId,
      conversation_id: input.conversationId ?? null,
      status: "converted",
    })
    .select("id")
    .single();

  if (cartError) throw cartError;

  const { error: itemsError } = await supabase.from("cart_items").insert(
    input.items.map((item) => ({
      cart_id: cart.id,
      product_id: item.productId,
      quantity: item.quantity,
      price_snapshot: item.unitPrice,
    })),
  );

  if (itemsError) throw itemsError;

  return cart.id;
}

export async function createOrder(
  input: CreateOrderInput,
): Promise<CreateOrderResult> {
  if (input.items.length === 0) {
    throw new Error("Cannot create an order with an empty cart.");
  }

  const supabase = createServiceClient();
  const inventoryItems = input.items.map((item) => ({
    productId: item.productId,
    quantity: item.quantity,
  }));

  const inventoryCheck = await validateOrderInventory(supabase, inventoryItems);
  if (!inventoryCheck.ok) {
    throw new InsufficientStockError(
      formatInsufficientStockMessage(inventoryCheck.issues),
    );
  }

  const customerId = await resolveCustomerId(supabase, input);
  const cartId = await createConvertedCart(supabase, {
    customerId,
    conversationId: input.conversationId,
    items: input.items,
  });

  const deliveryFee = DEFAULT_DELIVERY_FEE;
  const totalAmount = input.subtotal + deliveryFee;
  const isCod = input.payment.method === "cod";
  const isUpiManual =
    input.payment.method === "upi" && input.payment.upiAwaitingVerification;
  const paymentReference =
    input.payment.razorpayPaymentId ??
    input.payment.transactionReference ??
    (isCod ? `COD-${Date.now().toString(36).toUpperCase()}` : null) ??
    (isUpiManual
      ? `UPI-PENDING-${Date.now().toString(36).toUpperCase()}`
      : null);

  if (!paymentReference && !isCod && !isUpiManual) {
    throw new Error("Payment reference is required for online orders.");
  }

  const paymentNotes = isCod
    ? "Cash on Delivery — pay when your order arrives."
    : isUpiManual
      ? "UPI QR payment — awaiting manual verification."
      : input.payment.method === "card"
        ? `Card payment via Razorpay (${paymentReference})`
        : input.payment.upiId
          ? `UPI payment via ${input.payment.upiId.trim()} (${paymentReference})`
          : `Online payment (${paymentReference})`;

  const orderStatus: OrderStatus = isCod || isUpiManual ? "payment_pending" : "confirmed";
  const paymentStatus: PaymentStatus = isCod
    ? "pending"
    : isUpiManual
      ? "verification_pending"
      : "verified";

  const paymentMethod: PaymentMethod = input.payment.method;

  const orderPayload: Database["public"]["Tables"]["orders"]["Insert"] = {
    business_id: BUSINESS_ID,
    customer_id: customerId,
    cart_id: cartId,
    status: orderStatus,
    total_amount: totalAmount,
    delivery_fee: deliveryFee,
    payment_utr: paymentReference,
    payment_status: paymentStatus,
    payment_method: paymentMethod,
    delivery_address: input.checkout.address.trim(),
    notes: paymentNotes,
  };

  const basePayload = { ...orderPayload, tracking_id: null as string | null };

  const orderSelect =
    "id, status, total_amount, tracking_id, shipment_status, payment_status";

  async function tryInsert(
    shipmentStatus: "awaiting_payment" | "assigned",
    includePaymentMethod: boolean,
  ) {
    const payload = includePaymentMethod
      ? { ...basePayload, shipment_status: shipmentStatus }
      : (() => {
          const { payment_method: _removed, ...rest } = basePayload;
          return { ...rest, shipment_status: shipmentStatus };
        })();

    return supabase.from("orders").insert(payload).select(orderSelect).single();
  }

  let orderInsert = await tryInsert("awaiting_payment", true);

  if (
    orderInsert.error?.code === "23514" &&
    orderInsert.error.message.includes("shipment_status")
  ) {
    console.warn(
      "[ORDER] awaiting_payment rejected — retrying with assigned. Run order state machine migration.",
    );
    orderInsert = await tryInsert("assigned", true);
  }

  if (
    orderInsert.error &&
    (orderInsert.error.message.includes("payment_method") ||
      orderInsert.error.code === "PGRST204")
  ) {
    console.warn(
      "[ORDER] payment_method column missing — retrying without it. Run payment_method migration.",
    );
    orderInsert = await tryInsert("assigned", false);
  }

  const { data: order, error: orderError } = orderInsert;

  if (orderError) {
    console.error("[ORDER] Insert failed:", {
      code: orderError.code,
      message: orderError.message,
      details: orderError.details,
      hint: orderError.hint,
    });
    throw new Error(diagnoseSupabaseError(orderError));
  }

  console.log("[ORDER CREATED]", {
    order_id: order.id,
    status: order.status,
    payment_status: order.payment_status,
    total: Number(order.total_amount),
    customerId,
    shipmentPending: true,
  });

  const warnings: string[] = [];

  const shouldDeductInventory =
    isCod || order.payment_status === "verified";

  if (shouldDeductInventory) {
    try {
      const inventoryResult = await deductInventoryForOrder(
        supabase,
        order.id,
        inventoryItems,
      );
      console.log("[CHECKOUT] Inventory deduction status", {
        orderId: order.id,
        paymentMethod: input.payment.method,
        inventoryStatus: inventoryResult.status,
        ...(inventoryResult.status === "skipped" || inventoryResult.status === "failed"
          ? { reason: inventoryResult.reason }
          : {}),
      });

      if (
        inventoryResult.status === "skipped" ||
        inventoryResult.status === "failed"
      ) {
        warnings.push(
          inventoryResult.reason ??
            "Inventory could not be updated automatically.",
        );
      }
    } catch (inventoryError) {
      const reason =
        inventoryError instanceof Error
          ? inventoryError.message
          : "Inventory deduction failed.";
      console.error("[CHECKOUT] Inventory deduction threw — order kept", {
        orderId: order.id,
        reason,
        inventoryError,
      });
      warnings.push(reason);
    }
  }

  console.log("[ORDER] Awaiting shipment assignment", {
    order_id: order.id,
    paymentMethod: input.payment.method,
    paymentStatus: order.payment_status,
    trackingAssigned: Boolean(order.tracking_id),
  });

  try {
    const { data: customer, error: customerError } = await supabase
      .from("customers")
      .select("order_count, total_spent")
      .eq("id", customerId)
      .maybeSingle();

    if (customerError) throw customerError;

    if (customer) {
      const { error: statsError } = await supabase
        .from("customers")
        .update({
          order_count: customer.order_count + 1,
          total_spent: Number(customer.total_spent) + totalAmount,
        })
        .eq("id", customerId);

      if (statsError) throw statsError;
    }
  } catch (statsError) {
    const reason =
      statsError instanceof Error
        ? statsError.message
        : "Customer stats could not be updated.";
    console.error("[ORDER] Customer stats update failed — order kept", {
      orderId: order.id,
      reason,
      statsError,
    });
    warnings.push(reason);
  }

  if (input.conversationId) {
    try {
      const { error: messageError } = await supabase.from("messages").insert({
        conversation_id: input.conversationId,
        sender_type: "system",
        content: isUpiManual
          ? formatUpiPendingOrderMessage(order.id, totalAmount)
          : formatOrderConfirmationMessage(order.id, totalAmount),
        intent: encodeOrderConfirmedIntent(order.id),
        was_ai_drafted: false,
      });

      if (messageError) throw messageError;
    } catch (messageError) {
      const reason =
        messageError instanceof Error
          ? messageError.message
          : "Chat confirmation message could not be sent.";
      console.error("[ORDER] Conversation message insert failed — order kept", {
        orderId: order.id,
        reason,
        messageError,
      });
      warnings.push(reason);
    }
  }

  return {
    orderId: order.id,
    status: order.status,
    totalAmount: Number(order.total_amount),
    customerId,
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}
