import type { OrderStatus, PaymentMethod, PaymentStatus, ShipmentStatus } from "@/lib/types";
import { createServiceClient } from "@/lib/supabase/service-client";
import { isMissingColumnError } from "@/lib/supabase/errors";
import { resolvePaymentMethod } from "@/lib/orders/order-lifecycle";
import { mapShipmentStatusFromDb } from "@/lib/orders/shipment-status-compat";
import type { ReturnMetrics } from "@/lib/orders/return-management-service";
import { fetchReturnMetrics } from "@/lib/orders/return-management-service";

const CONFIRMED_STATUSES: OrderStatus[] = [
  "confirmed",
  "packed",
  "shipped",
  "delivered",
];

export interface DashboardMetrics {
  totalOrders: number;
  revenue: number;
  pendingPayments: number;
  confirmedOrders: number;
}

export interface RecentOrderRow {
  id: string;
  total_amount: number;
  status: OrderStatus;
  payment_status: PaymentStatus;
  payment_method: PaymentMethod;
  shipment_status: ShipmentStatus;
  created_at: string;
  customer_name: string | null;
  customer_phone: string | null;
}

export interface DashboardData {
  metrics: DashboardMetrics;
  recentOrders: RecentOrderRow[];
  returnMetrics: ReturnMetrics | null;
}

function buildRecentOrdersSelect(includePaymentMethod: boolean): string {
  const paymentMethodField = includePaymentMethod ? "payment_method, " : "";
  return `id, total_amount, status, payment_status, ${paymentMethodField}payment_utr, notes, shipment_status, created_at, customers ( name, phone )`;
}

type RecentOrderDbRow = {
  id: string;
  total_amount: number;
  status: OrderStatus;
  payment_status: PaymentStatus;
  payment_method?: PaymentMethod | null;
  payment_utr?: string | null;
  notes?: string | null;
  shipment_status: string;
  created_at: string;
  customers: { name: string | null; phone: string | null } | null;
};

async function fetchRecentOrders(
  supabase: ReturnType<typeof createServiceClient>,
) {
  let includePaymentMethod = true;
  let result = await supabase
    .from("orders")
    .select(buildRecentOrdersSelect(includePaymentMethod))
    .order("created_at", { ascending: false })
    .limit(5);

  if (result.error && isMissingColumnError(result.error, "payment_method")) {
    if (process.env.NODE_ENV === "development") {
      console.warn(
        "[DASHBOARD] payment_method column missing — using legacy fallback. Run supabase/migrations/20250623110000_payment_method.sql",
      );
    }
    includePaymentMethod = false;
    result = await supabase
      .from("orders")
      .select(buildRecentOrdersSelect(includePaymentMethod))
      .order("created_at", { ascending: false })
      .limit(5);
  }

  return result;
}

export async function fetchDashboardMetrics(): Promise<DashboardData> {
  const supabase = createServiceClient();

  const [totalResult, revenueResult, pendingResult, confirmedResult, recentResult, returnMetricsResult] =
    await Promise.all([
      supabase.from("orders").select("id", { count: "exact", head: true }),
      supabase
        .from("orders")
        .select("total_amount")
        .neq("status", "cancelled"),
      supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .in("payment_status", ["pending", "verification_pending", "retry_submitted"]),
      supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .in("status", CONFIRMED_STATUSES),
      fetchRecentOrders(supabase),
      fetchReturnMetrics().catch(() => null),
    ]);

  if (totalResult.error) throw totalResult.error;
  if (revenueResult.error) throw revenueResult.error;
  if (pendingResult.error) throw pendingResult.error;
  if (confirmedResult.error) throw confirmedResult.error;
  if (recentResult.error) throw recentResult.error;

  const revenue = (revenueResult.data ?? []).reduce(
    (sum, row) => sum + Number(row.total_amount),
    0,
  );

  const metrics: DashboardMetrics = {
    totalOrders: totalResult.count ?? 0,
    revenue,
    pendingPayments: pendingResult.count ?? 0,
    confirmedOrders: confirmedResult.count ?? 0,
  };

  const recentOrders: RecentOrderRow[] = (recentResult.data ?? []).map(
    (row) => {
      const typed = row as unknown as RecentOrderDbRow;
      return {
        id: typed.id,
        total_amount: Number(typed.total_amount),
        status: typed.status,
        payment_status: typed.payment_status,
        payment_method: resolvePaymentMethod({
          payment_method: typed.payment_method,
          payment_utr: typed.payment_utr ?? null,
          notes: typed.notes,
        }),
        shipment_status: mapShipmentStatusFromDb(typed.shipment_status),
        created_at: typed.created_at,
        customer_name: typed.customers?.name ?? null,
        customer_phone: typed.customers?.phone ?? null,
      };
    },
  );

  console.log("[DASHBOARD FETCH]", {
    totalOrders: metrics.totalOrders,
    revenue: metrics.revenue,
    pendingPayments: metrics.pendingPayments,
    confirmedOrders: metrics.confirmedOrders,
    recentOrders: recentOrders.length,
  });

  return { metrics, recentOrders, returnMetrics: returnMetricsResult };
}
