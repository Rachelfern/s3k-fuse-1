import type { OrderStatus, PaymentMethod, PaymentStatus, ShipmentStatus } from "@/lib/types";
import { createServiceClient } from "@/lib/supabase/service-client";
import { isMissingColumnError } from "@/lib/supabase/errors";
import {
  OrderStateValidationError,
  orderStatusFromShipment,
  resolvePaymentMethod,
  validateShipmentStatusChange,
} from "@/lib/orders/order-lifecycle";
import { updateOrderShipmentStatus } from "@/lib/orders/order-update";
import {
  mapShipmentStatusFromDb,
} from "@/lib/orders/shipment-status-compat";

export interface ShipmentRow {
  id: string;
  delivery_courier: string | null;
  tracking_id: string;
  shipment_status: ShipmentStatus;
  payment_status: PaymentStatus;
  payment_method: PaymentMethod;
  notes: string | null;
  created_at: string;
  customer_name: string | null;
  customer_phone: string | null;
}

type ShipmentDbRow = {
  id: string;
  delivery_courier: string | null;
  tracking_id: string | null;
  shipment_status: string;
  payment_status: PaymentStatus;
  payment_method?: PaymentMethod | null;
  payment_utr?: string | null;
  notes: string | null;
  created_at: string;
  customers: { name: string | null; phone: string | null } | null;
};

function buildShipmentsSelect(includePaymentMethod: boolean): string {
  const paymentMethodField = includePaymentMethod ? "payment_method, " : "";
  return `id, delivery_courier, tracking_id, shipment_status, payment_status, ${paymentMethodField}payment_utr, notes, created_at, customers ( name, phone )`;
}

function mapOrderRow(row: ShipmentDbRow): ShipmentRow | null {
  if (!row.tracking_id) return null;

  return {
    id: row.id,
    delivery_courier: row.delivery_courier,
    tracking_id: row.tracking_id,
    shipment_status: mapShipmentStatusFromDb(row.shipment_status),
    payment_status: row.payment_status,
    payment_method: resolvePaymentMethod({
      payment_method: row.payment_method,
      payment_utr: row.payment_utr ?? null,
      notes: row.notes,
    }),
    notes: row.notes,
    created_at: row.created_at,
    customer_name: row.customers?.name ?? null,
    customer_phone: row.customers?.phone ?? null,
  };
}

export async function fetchAdminShipments(): Promise<ShipmentRow[]> {
  const supabase = createServiceClient();

  let includePaymentMethod = true;
  let result = await supabase
    .from("orders")
    .select(buildShipmentsSelect(includePaymentMethod))
    .not("tracking_id", "is", null)
    .order("created_at", { ascending: false });

  if (result.error && isMissingColumnError(result.error, "payment_method")) {
    if (process.env.NODE_ENV === "development") {
      console.warn(
        "[ADMIN SHIPMENTS] payment_method column missing — using legacy fallback. Run supabase/migrations/20250623110000_payment_method.sql",
      );
    }
    includePaymentMethod = false;
    result = await supabase
      .from("orders")
      .select(buildShipmentsSelect(includePaymentMethod))
      .not("tracking_id", "is", null)
      .order("created_at", { ascending: false });
  }

  const { data, error } = result;

  if (error) throw error;

  const rows = (data ?? [])
    .map((row) => mapOrderRow(row as unknown as ShipmentDbRow))
    .filter((row): row is ShipmentRow => row !== null);

  if (process.env.NODE_ENV === "development") {
    console.log("[ADMIN SHIPMENTS FETCH]", {
      rowsReturned: rows.length,
      error: null,
      includePaymentMethod,
    });
  }

  return rows;
}

async function fetchShipmentOrderState(
  supabase: ReturnType<typeof createServiceClient>,
  orderId: string,
): Promise<{
  payment_method?: PaymentMethod | null;
  payment_utr: string | null;
  payment_status: PaymentStatus;
  shipment_status: ShipmentStatus;
  notes?: string | null;
} | null> {
  let result = await supabase
    .from("orders")
    .select("payment_method, payment_utr, payment_status, shipment_status, notes")
    .eq("id", orderId)
    .maybeSingle();

  if (result.error && isMissingColumnError(result.error, "payment_method")) {
    result = await supabase
      .from("orders")
      .select("payment_utr, payment_status, shipment_status, notes")
      .eq("id", orderId)
      .maybeSingle();
  }

  if (result.error) throw result.error;
  return result.data;
}

export async function updateShipmentStatus(
  orderId: string,
  status: ShipmentStatus,
): Promise<void> {
  const supabase = createServiceClient();

  const current = await fetchShipmentOrderState(supabase, orderId);

  if (!current) {
    throw new OrderStateValidationError("Order not found.");
  }

  validateShipmentStatusChange(
    resolvePaymentMethod({
      payment_method: current.payment_method,
      payment_utr: current.payment_utr,
      notes: current.notes,
    }),
    current.payment_status,
    mapShipmentStatusFromDb(current.shipment_status),
    status,
  );

  const mappedStatus = orderStatusFromShipment(status);
  const updateFields: {
    shipment_status: ShipmentStatus;
    status?: OrderStatus;
  } = { shipment_status: status };

  if (mappedStatus) {
    updateFields.status = mappedStatus;
  }

  await updateOrderShipmentStatus(supabase, orderId, updateFields);
}

export { OrderStateValidationError };
