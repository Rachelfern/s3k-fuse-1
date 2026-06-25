import { isCheckConstraintError } from "@/lib/supabase/errors";
import {
  mapShipmentFieldsForLegacyWrite,
  mapShipmentStatusForLegacyWrite,
  mapShipmentStatusFromDb,
} from "@/lib/orders/shipment-status-compat";
import type { ShipmentStatus } from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types";

type OrderUpdate = Database["public"]["Tables"]["orders"]["Update"];

export async function executeOrderUpdate(
  supabase: SupabaseClient<Database>,
  orderId: string,
  fields: OrderUpdate,
): Promise<void> {
  const attempt = (payload: OrderUpdate) =>
    supabase.from("orders").update(payload).eq("id", orderId);

  let result = await attempt(fields);
  if (!result.error) return;

  if (!isCheckConstraintError(result.error, "shipment_status")) {
    throw result.error;
  }

  if (process.env.NODE_ENV === "development") {
    console.warn(
      "[ORDER UPDATE] shipment_status check failed — retrying with legacy values. Run supabase/migrations/20250623100000_order_state_machine.sql",
      { orderId, fields },
    );
  }

  let legacyFields: OrderUpdate = mapShipmentFieldsForLegacyWrite(
    fields,
  ) as OrderUpdate;

  if (!legacyFields.shipment_status) {
    const { data: current, error: fetchError } = await supabase
      .from("orders")
      .select("shipment_status")
      .eq("id", orderId)
      .maybeSingle();

    if (fetchError) throw fetchError;

    if (current?.shipment_status) {
      legacyFields = {
        ...legacyFields,
        shipment_status: mapShipmentStatusForLegacyWrite(
          mapShipmentStatusFromDb(current.shipment_status),
        ) as ShipmentStatus,
      };
    }
  }

  result = await attempt(legacyFields);
  if (result.error) throw result.error;
}

export async function updateOrderShipmentStatus(
  supabase: SupabaseClient<Database>,
  orderId: string,
  fields: {
    shipment_status: ShipmentStatus;
    status?: OrderUpdate["status"];
  },
): Promise<void> {
  await executeOrderUpdate(supabase, orderId, fields);
}
