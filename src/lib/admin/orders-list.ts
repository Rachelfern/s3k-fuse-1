import type { OrderStatus } from "@/lib/types";
import { createServiceClient } from "@/lib/supabase/service-client";
import type { OrderFilterValue } from "@/lib/admin/order-utils";

export interface OrderListRow {
  id: string;
  status: OrderStatus;
  total_amount: number;
  delivery_fee: number;
  created_at: string;
  delivery_address: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_address: string | null;
}

export async function fetchAdminOrders(
  statusFilter: OrderFilterValue = "all",
): Promise<OrderListRow[]> {
  const supabase = createServiceClient();

  let query = supabase
    .from("orders")
    .select(
      "id, status, total_amount, delivery_fee, created_at, delivery_address, customers ( name, phone, address )",
    )
    .order("created_at", { ascending: false });

  if (statusFilter !== "all") {
    query = query.eq("status", statusFilter);
  }

  const { data, error } = await query;

  if (error) throw error;

  const rows = (data ?? []).map((row) => ({
    id: row.id,
    status: row.status,
    total_amount: Number(row.total_amount),
    delivery_fee: Number(row.delivery_fee),
    created_at: row.created_at,
    delivery_address: row.delivery_address,
    customer_name: row.customers?.name ?? null,
    customer_phone: row.customers?.phone ?? null,
    customer_address: row.customers?.address ?? null,
  }));

  console.log("[ADMIN ORDERS FETCH]", {
    statusFilter,
    ordersReturned: rows.length,
  });

  return rows;
}
