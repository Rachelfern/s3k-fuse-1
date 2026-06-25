import type {
  Database,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  ShipmentStatus,
} from "@/lib/types";
import { createServiceClient } from "@/lib/supabase/service-client";
import { isMissingColumnError } from "@/lib/supabase/errors";
import { executeOrderUpdate } from "@/lib/orders/order-update";
import {
  OrderStateValidationError,
  isCodOrder,
  resolvePaymentMethod,
  validateAdminOrderDetailUpdate,
  validateOrderFieldsUpdate,
} from "@/lib/orders/order-lifecycle";
import { notifyCustomerOfCodCollectionFailure } from "@/lib/orders/cod-collection-flow";
import { mapShipmentStatusFromDb } from "@/lib/orders/shipment-status-compat";

export type OrderUpdate = Database["public"]["Tables"]["orders"]["Update"];

export interface OrderItemRow {
  id: string;
  product_id: string | null;
  quantity: number;
  price_snapshot: number;
  product_name: string;
  image_url: string | null;
}

export interface OrderDetail {
  id: string;
  status: OrderStatus;
  total_amount: number;
  delivery_fee: number;
  payment_utr: string | null;
  payment_status: PaymentStatus;
  payment_method: PaymentMethod;
  delivery_courier: string | null;
  tracking_id: string | null;
  shipment_status: ShipmentStatus;
  delivery_address: string | null;
  notes: string | null;
  payment_screenshot_path: string | null;
  payment_screenshot_uploaded_at: string | null;
  payment_rejection_reason: string | null;
  payment_rejected_at: string | null;
  payment_retry_submitted_at: string | null;
  created_at: string;
  customer_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_address: string | null;
  items: OrderItemRow[];
}

type CartItemEmbed = {
  id: string;
  quantity: number;
  price_snapshot: number;
  product_id: string | null;
  products: { name_en: string; image_url: string | null } | null;
};

type OrderDetailRow = {
  id: string;
  status: OrderStatus;
  total_amount: number;
  delivery_fee: number;
  payment_utr: string | null;
  payment_status: PaymentStatus;
  customer_id: string | null;
  payment_method?: PaymentMethod | null;
  delivery_courier: string | null;
  tracking_id: string | null;
  shipment_status: string;
  delivery_address: string | null;
  notes: string | null;
  payment_screenshot_path?: string | null;
  payment_screenshot_uploaded_at?: string | null;
  payment_rejection_reason?: string | null;
  payment_rejected_at?: string | null;
  payment_retry_submitted_at?: string | null;
  created_at: string;
  customers: { name: string | null; phone: string | null; address: string | null } | null;
  carts: { cart_items: CartItemEmbed[] | null } | null;
};

function buildOrderDetailSelect(options: {
  includePaymentMethod: boolean;
  includePaymentScreenshot: boolean;
  includePaymentRejection: boolean;
}): string {
  const paymentMethodField = options.includePaymentMethod ? "payment_method," : "";
  const paymentScreenshotFields = options.includePaymentScreenshot
    ? "payment_screenshot_path,\n      payment_screenshot_uploaded_at,"
    : "";
  const paymentRejectionFields = options.includePaymentRejection
    ? "payment_rejection_reason,\n      payment_rejected_at,\n      payment_retry_submitted_at,"
    : "";

  return `
      id,
      status,
      total_amount,
      delivery_fee,
      payment_utr,
      payment_status,
      customer_id,
      ${paymentMethodField}
      delivery_courier,
      tracking_id,
      shipment_status,
      delivery_address,
      notes,
      ${paymentScreenshotFields}
      ${paymentRejectionFields}
      created_at,
      customers ( name, phone, address ),
      carts (
        cart_items (
          id,
          quantity,
          price_snapshot,
          product_id,
          products ( name_en, image_url )
        )
      )
    `;
}

function mapOrderDetailRow(data: OrderDetailRow): OrderDetail {
  const cartItems = data.carts?.cart_items ?? [];

  const items: OrderItemRow[] = cartItems.map((item) => ({
    id: item.id,
    product_id: item.product_id ?? null,
    quantity: item.quantity,
    price_snapshot: Number(item.price_snapshot),
    product_name: item.products?.name_en ?? "Unknown product",
    image_url: item.products?.image_url ?? null,
  }));

  return {
    id: data.id,
    status: data.status,
    total_amount: Number(data.total_amount),
    delivery_fee: Number(data.delivery_fee),
    payment_utr: data.payment_utr,
    payment_status: data.payment_status,
    payment_method: resolvePaymentMethod({
      payment_method: data.payment_method,
      payment_utr: data.payment_utr,
      notes: data.notes,
    }),
    delivery_courier: data.delivery_courier,
    tracking_id: data.tracking_id,
    shipment_status: mapShipmentStatusFromDb(data.shipment_status),
    delivery_address: data.delivery_address,
    notes: data.notes,
    payment_screenshot_path: data.payment_screenshot_path ?? null,
    payment_screenshot_uploaded_at: data.payment_screenshot_uploaded_at ?? null,
    payment_rejection_reason: data.payment_rejection_reason ?? null,
    payment_rejected_at: data.payment_rejected_at ?? null,
    payment_retry_submitted_at: data.payment_retry_submitted_at ?? null,
    created_at: data.created_at,
    customer_id: data.customer_id ?? null,
    customer_name: data.customers?.name ?? null,
    customer_phone: data.customers?.phone ?? null,
    customer_address: data.customers?.address ?? null,
    items,
  };
}

export async function fetchAdminOrderDetail(
  orderId: string,
): Promise<OrderDetail | null> {
  const supabase = createServiceClient();

  let includePaymentMethod = true;
  let includePaymentScreenshot = true;
  let includePaymentRejection = true;

  let result = await supabase
    .from("orders")
    .select(
      buildOrderDetailSelect({
        includePaymentMethod,
        includePaymentScreenshot,
        includePaymentRejection,
      }),
    )
    .eq("id", orderId)
    .maybeSingle();

  while (result.error) {
    if (
      isMissingColumnError(result.error, "payment_method") &&
      includePaymentMethod
    ) {
      if (process.env.NODE_ENV === "development") {
        console.warn(
          "[ADMIN ORDER DETAIL] payment_method column missing — using legacy fallback. Run supabase/migrations/20250623110000_payment_method.sql",
        );
      }
      includePaymentMethod = false;
    } else if (
      (isMissingColumnError(result.error, "payment_screenshot_path") ||
        isMissingColumnError(result.error, "payment_screenshot_uploaded_at")) &&
      includePaymentScreenshot
    ) {
      if (process.env.NODE_ENV === "development") {
        console.warn(
          "[ADMIN ORDER DETAIL] payment screenshot columns missing — using legacy fallback. Run supabase/migrations/20250623140000_ai_ops_payment_screenshots.sql",
        );
      }
      includePaymentScreenshot = false;
    } else if (
      (isMissingColumnError(result.error, "payment_rejection_reason") ||
        isMissingColumnError(result.error, "payment_rejected_at") ||
        isMissingColumnError(result.error, "payment_retry_submitted_at")) &&
      includePaymentRejection
    ) {
      includePaymentRejection = false;
    } else {
      break;
    }

    result = await supabase
      .from("orders")
      .select(
        buildOrderDetailSelect({
          includePaymentMethod,
          includePaymentScreenshot,
          includePaymentRejection,
        }),
      )
      .eq("id", orderId)
      .maybeSingle();
  }

  const { data, error } = result;

  if (process.env.NODE_ENV === "development") {
    console.log("[ADMIN ORDER DETAIL FETCH]", {
      orderId,
      data: !!data,
      error,
      includePaymentMethod,
    });
  }

  if (error) throw error;
  if (!data) return null;

  return mapOrderDetailRow(data as unknown as OrderDetailRow);
}

type OrderStateRow = {
  payment_method?: PaymentMethod | null;
  payment_utr: string | null;
  payment_status: PaymentStatus;
  shipment_status: ShipmentStatus;
  total_amount: number;
  notes?: string | null;
};

async function fetchOrderStateRow(
  supabase: ReturnType<typeof createServiceClient>,
  orderId: string,
): Promise<{ data: OrderStateRow | null; error: Error | null }> {
  let result = await supabase
    .from("orders")
    .select("payment_method, payment_utr, payment_status, shipment_status, total_amount, notes")
    .eq("id", orderId)
    .maybeSingle();

  if (result.error && isMissingColumnError(result.error, "payment_method")) {
    result = await supabase
      .from("orders")
      .select("payment_utr, payment_status, shipment_status, total_amount, notes")
      .eq("id", orderId)
      .maybeSingle();
  }

  const row = result.data as OrderStateRow | null;

  return {
    data: row
      ? {
          ...row,
          shipment_status: mapShipmentStatusFromDb(row.shipment_status),
        }
      : null,
    error: result.error,
  };
}

export async function updateAdminOrder(
  orderId: string,
  fields: OrderUpdate,
): Promise<void> {
  const supabase = createServiceClient();

  const { data: current, error: fetchError } = await fetchOrderStateRow(
    supabase,
    orderId,
  );

  if (fetchError) throw fetchError;
  if (!current) {
    throw new OrderStateValidationError("Order not found.");
  }

  const resolvedPaymentMethod = resolvePaymentMethod({
    payment_method: current.payment_method,
    payment_utr: current.payment_utr,
    notes: current.notes,
  });

  validateAdminOrderDetailUpdate(
    {
      payment_method: resolvedPaymentMethod,
      payment_status: current.payment_status,
    },
    {
      status: fields.status,
      shipment_status: fields.shipment_status,
      payment_status: fields.payment_status,
      delivery_courier: fields.delivery_courier,
      tracking_id: fields.tracking_id,
      notes: fields.notes,
    },
  );

  validateOrderFieldsUpdate(
    {
      payment_method: resolvedPaymentMethod,
      payment_status: current.payment_status,
      shipment_status: current.shipment_status,
    },
    {
      payment_method: fields.payment_method,
      payment_status: fields.payment_status,
      shipment_status: fields.shipment_status,
    },
  );

  let updateFields: OrderUpdate = { ...fields };

  if (
    fields.payment_method !== undefined &&
    current.payment_method == null
  ) {
    const { payment_method: _removed, ...rest } = updateFields;
    updateFields = rest;
  }

  try {
    await executeOrderUpdate(supabase, orderId, updateFields);
  } catch (error) {
    if (
      fields.payment_method !== undefined &&
      isMissingColumnError(error, "payment_method")
    ) {
      const { payment_method: _removed, ...rest } = updateFields;
      await executeOrderUpdate(supabase, orderId, rest);
    } else {
      throw error;
    }
  }

  if (
    fields.payment_status === "failed" &&
    current.payment_status !== "failed" &&
    isCodOrder(resolvedPaymentMethod)
  ) {
    await notifyCustomerOfCodCollectionFailure({
      orderId,
      totalAmount: Number(current.total_amount),
    });
  }
}

export { OrderStateValidationError };
