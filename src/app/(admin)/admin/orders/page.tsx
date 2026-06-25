"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AdminDateTimeCell } from "@/components/admin/admin-datetime-cell";
import { ConnectionErrorBanner } from "@/components/ui/connection-error-banner";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import type { OrderListRow } from "@/lib/admin/orders-list";
import type { OrderStatus } from "@/lib/types";
import {
  formatINR,
  formatStatusLabel,
  ORDER_FILTER_TABS,
  ORDER_STATUS_CHIP_STYLES,
  type OrderFilterValue,
} from "@/lib/admin/order-utils";
import { cn } from "@/lib/utils";

async function fetchOrdersFromApi(
  statusFilter: OrderFilterValue,
): Promise<OrderListRow[]> {
  const params = new URLSearchParams();
  if (statusFilter !== "all") {
    params.set("status", statusFilter);
  }

  const query = params.toString();
  const response = await fetch(
    `/api/admin/orders${query ? `?${query}` : ""}`,
    { cache: "no-store" },
  );

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(body?.error ?? `Request failed (${response.status})`);
  }

  const data = (await response.json()) as { orders: OrderListRow[] };
  console.log("[RECENT ORDERS]", { rows: data.orders.length, statusFilter });
  return data.orders;
}

function StatusChip({ status }: { status: OrderStatus }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
        ORDER_STATUS_CHIP_STYLES[status],
      )}
    >
      {formatStatusLabel(status)}
    </span>
  );
}

export default function AdminOrdersPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<OrderFilterValue>("all");
  const [orders, setOrders] = useState<OrderListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadOrders = useCallback(async (filter: OrderFilterValue) => {
    setLoading(true);
    try {
      const rows = await fetchOrdersFromApi(filter);
      setOrders(rows);
      setError(null);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Failed to load orders.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOrders(activeTab);
  }, [activeTab, loadOrders]);

  function getCustomerAddress(order: OrderListRow): string {
    return order.delivery_address ?? order.customer_address ?? "—";
  }

  function getItemsSubtotal(order: OrderListRow): number {
    return order.total_amount - order.delivery_fee;
  }

  return (
    <div className="admin-page">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Orders Overview</h2>
        <p className="mt-1 text-sm text-gray-500">
          Manage and track all customer orders
        </p>
      </div>

      {error ? (
        <ConnectionErrorBanner
          message={`Failed to load orders: ${error}`}
          onRetry={() => void loadOrders(activeTab)}
        />
      ) : null}

      <div className="flex flex-wrap gap-1">
        {ORDER_FILTER_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setActiveTab(tab.value)}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm transition-colors",
              activeTab === tab.value
                ? "bg-green-500 text-white"
                : "text-gray-500 hover:text-gray-700",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <p className="text-sm text-gray-400">
        {loading ? "Loading…" : `${orders.length} orders found`}
      </p>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50/80 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                <th className="px-5 py-3">Order ID</th>
                <th className="px-5 py-3">Customer Details</th>
                <th className="min-w-[7.5rem] whitespace-nowrap px-5 py-3">Order Date</th>
                <th className="px-5 py-3">Items Subtotal</th>
                <th className="px-5 py-3">Delivery</th>
                <th className="px-5 py-3">Total Due</th>
                <th className="px-5 py-3">Current Status</th>
                <th className="px-5 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <TableSkeleton rows={6} columns={8} />
              ) : orders.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-5 py-10 text-center text-gray-500"
                  >
                    No orders match this filter.
                  </td>
                </tr>
              ) : (
                orders.map((order) => (
                  <tr
                    key={order.id}
                    onClick={() => router.push(`/admin/orders/${order.id}`)}
                    className="cursor-pointer border-b border-gray-100 last:border-0 hover:bg-gray-50/80"
                  >
                    <td className="px-5 py-4">
                      <span className="font-mono text-sm font-medium text-blue-600">
                        {order.id}
                      </span>
                    </td>
                    <td className="max-w-[220px] px-5 py-4">
                      <p className="text-sm font-medium text-gray-900">
                        {order.customer_name ?? "Unknown"}
                      </p>
                      <p className="text-xs text-gray-400">
                        {order.customer_phone ?? "—"}
                      </p>
                      <p className="truncate text-xs text-gray-400">
                        {getCustomerAddress(order)}
                      </p>
                    </td>
                    <td className="min-w-[7.5rem] whitespace-nowrap px-5 py-4">
                      <AdminDateTimeCell iso={order.created_at} />
                    </td>
                    <td className="px-5 py-4 text-gray-700">
                      {formatINR(getItemsSubtotal(order))}
                    </td>
                    <td className="px-5 py-4 text-gray-700">
                      {formatINR(order.delivery_fee)}
                    </td>
                    <td className="px-5 py-4 font-semibold text-gray-900">
                      {formatINR(order.total_amount)}
                    </td>
                    <td className="px-5 py-4">
                      <StatusChip status={order.status} />
                    </td>
                    <td className="px-5 py-4">
                      <Link
                        href={`/admin/orders/${order.id}`}
                        onClick={(event) => event.stopPropagation()}
                        className="inline-flex rounded-lg bg-green-500 px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-green-600"
                      >
                        Manage →
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
