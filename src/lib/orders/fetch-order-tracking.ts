import { isMissingColumnError } from "@/lib/supabase/errors";
import { resolvePaymentMethod } from "@/lib/orders/order-lifecycle";
import { mapShipmentStatusFromDb } from "@/lib/orders/shipment-status-compat";
import type {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  ShipmentStatus,
} from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types";

export type OrderTrackingRow = {
  id: string;
  status: OrderStatus;
  total_amount: number;
  payment_utr: string | null;
  payment_status: PaymentStatus;
  payment_method: PaymentMethod;
  shipment_status: ShipmentStatus;
  tracking_id: string | null;
  created_at: string;
  payment_rejection_reason: string | null;
  payment_rejected_at: string | null;
};

type OrderTrackingDbRow = {
  id: string;
  status: OrderStatus;
  total_amount: number;
  payment_utr: string | null;
  payment_status: PaymentStatus;
  payment_method?: PaymentMethod | null;
  shipment_status: string;
  tracking_id: string | null;
  created_at: string;
  payment_rejection_reason?: string | null;
  payment_rejected_at?: string | null;
};

function buildTrackingSelect(includePaymentMethod: boolean, includeRejection: boolean): string {
  const paymentMethodField = includePaymentMethod ? "payment_method, " : "";
  const rejectionFields = includeRejection
    ? "payment_rejection_reason, payment_rejected_at, "
    : "";
  return `id, status, total_amount, payment_utr, payment_status, ${paymentMethodField}${rejectionFields}shipment_status, tracking_id, created_at`;
}

function mapTrackingRow(data: OrderTrackingDbRow): OrderTrackingRow {
  return {
    id: data.id,
    status: data.status,
    total_amount: Number(data.total_amount),
    payment_utr: data.payment_utr,
    payment_status: data.payment_status,
    payment_method: resolvePaymentMethod({
      payment_method: data.payment_method,
      payment_utr: data.payment_utr,
    }),
    shipment_status: mapShipmentStatusFromDb(data.shipment_status),
    tracking_id: data.tracking_id,
    created_at: data.created_at,
    payment_rejection_reason: data.payment_rejection_reason ?? null,
    payment_rejected_at: data.payment_rejected_at ?? null,
  };
}

export async function fetchOrderTracking(
  supabase: SupabaseClient<Database>,
  orderId: string,
): Promise<{ data: OrderTrackingRow | null; error: Error | null }> {
  let includePaymentMethod = true;
  let includeRejection = true;

  let result = await supabase
    .from("orders")
    .select(buildTrackingSelect(includePaymentMethod, includeRejection))
    .eq("id", orderId)
    .maybeSingle();

  if (
    result.error &&
    (isMissingColumnError(result.error, "payment_rejection_reason") ||
      isMissingColumnError(result.error, "payment_rejected_at"))
  ) {
    includeRejection = false;
    result = await supabase
      .from("orders")
      .select(buildTrackingSelect(includePaymentMethod, includeRejection))
      .eq("id", orderId)
      .maybeSingle();
  }

  if (result.error && isMissingColumnError(result.error, "payment_method")) {
    if (process.env.NODE_ENV === "development") {
      console.warn(
        "[ORDER TRACKING] payment_method column missing — using legacy fallback. Run supabase/migrations/20250623110000_payment_method.sql",
      );
    }
    includePaymentMethod = false;
    result = await supabase
      .from("orders")
      .select(buildTrackingSelect(includePaymentMethod, includeRejection))
      .eq("id", orderId)
      .maybeSingle();
  }

  if (result.error) {
    return { data: null, error: result.error };
  }

  if (!result.data) {
    return { data: null, error: null };
  }

  return {
    data: mapTrackingRow(result.data as unknown as OrderTrackingDbRow),
    error: null,
  };
}

export function mapOrderTrackingUpdate(
  current: OrderTrackingRow | null,
  updated: Partial<OrderTrackingDbRow> & { id: string },
): OrderTrackingRow {
  const paymentMethod = resolvePaymentMethod({
    payment_method: updated.payment_method ?? current?.payment_method,
    payment_utr: updated.payment_utr ?? current?.payment_utr ?? null,
  });

  return {
    id: updated.id,
    status: (updated.status ?? current?.status ?? "new") as OrderStatus,
    total_amount: Number(updated.total_amount ?? current?.total_amount ?? 0),
    payment_utr: updated.payment_utr ?? current?.payment_utr ?? null,
    payment_status: (updated.payment_status ??
      current?.payment_status ??
      "pending") as PaymentStatus,
    payment_method: paymentMethod,
    shipment_status: mapShipmentStatusFromDb(
      updated.shipment_status ?? current?.shipment_status ?? "assigned",
    ),
    tracking_id: updated.tracking_id ?? current?.tracking_id ?? null,
    created_at: updated.created_at ?? current?.created_at ?? new Date().toISOString(),
    payment_rejection_reason:
      updated.payment_rejection_reason ?? current?.payment_rejection_reason ?? null,
    payment_rejected_at:
      updated.payment_rejected_at ?? current?.payment_rejected_at ?? null,
  };
}
