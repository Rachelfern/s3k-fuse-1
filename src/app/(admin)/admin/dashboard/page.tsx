"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle, Clock, PackageX, ShoppingBag } from "lucide-react";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import type {
  DashboardMetrics,
  RecentOrderRow,
} from "@/lib/admin/dashboard-metrics";
import type { ReturnMetrics } from "@/lib/orders/return-management-service";
import { ADMIN_RETURN_SECTIONS } from "@/lib/orders/return-status-timeline";
import { AdminDateTimeCell } from "@/components/admin/admin-datetime-cell";
import { AnimatedCounter } from "@/components/ui/animated-counter";
import { Button } from "@/components/ui/button";
import {
  ConnectionErrorBanner,
  RealtimeUnavailableBanner,
} from "@/components/ui/connection-error-banner";
import { RealtimeStatusBadge } from "@/components/ui/realtime-status-badge";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { useRealtimeSubscription } from "@/hooks/use-realtime-subscription";
import type { OrderStatus, PaymentMethod, PaymentStatus, ShipmentStatus } from "@/lib/types";
import {
  formatPaymentStatusLabel,
  formatShipmentStatusLabel,
  isAwaitingCodCollection,
  isCodCollectionFailed,
  isInvalidOrderState,
  PAYMENT_STATUS_CHIP_STYLES,
  SHIPMENT_STATUS_SELECT_STYLES,
} from "@/lib/admin/order-utils";
import { isUpiAwaitingVerification } from "@/lib/orders/order-lifecycle";
import { cn } from "@/lib/utils";

type MetricKey =
  | "totalOrders"
  | "revenue"
  | "pendingPayments"
  | "confirmedOrders";

function formatRevenue(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function LiveBadge({ active }: { active: boolean }) {
  if (!active) return null;

  return (
    <span className="flex items-center gap-1.5 text-xs text-green-500">
      <span className="size-1.5 animate-pulse rounded-full bg-green-500" />
      Live
    </span>
  );
}

function PaymentStatusChip({
  paymentMethod,
  status,
}: {
  paymentMethod: PaymentMethod;
  status: PaymentStatus;
}) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ring-transparent",
        PAYMENT_STATUS_CHIP_STYLES[status],
      )}
    >
      {formatPaymentStatusLabel(paymentMethod, status)}
    </span>
  );
}

function ShipmentStatusChip({ status }: { status: ShipmentStatus }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ring-transparent",
        SHIPMENT_STATUS_SELECT_STYLES[status],
      )}
    >
      {formatShipmentStatusLabel(status)}
    </span>
  );
}

function MetricCardSkeleton() {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="mb-3 h-[15px]" />
      <div className="mb-4 size-9 animate-pulse rounded-lg bg-gray-100" />
      <div className="h-8 w-20 animate-pulse rounded bg-gray-100" />
      <div className="mt-2 h-4 w-28 animate-pulse rounded bg-gray-100" />
    </div>
  );
}

interface MetricCardProps {
  icon: React.ReactNode;
  value: React.ReactNode;
  label: string;
  flash?: boolean;
  live?: boolean;
}

function MetricCard({ icon, value, label, flash, live }: MetricCardProps) {
  return (
    <div
      className={cn(
        "relative rounded-xl border border-gray-100 bg-white p-5 shadow-sm transition-colors duration-500",
        flash && "border-green-200 bg-green-50/60",
      )}
    >
      <div className="absolute right-5 top-5">
        <LiveBadge active={live ?? false} />
      </div>
      {flash ? (
        <p className="mb-3 text-[10px] font-medium text-green-600">
          Updated just now
        </p>
      ) : (
        <div className="mb-3 h-[15px]" />
      )}
      <div className="mb-4">{icon}</div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="mt-1 text-sm text-gray-500">{label}</p>
    </div>
  );
}

function getCustomerLabel(order: RecentOrderRow): string {
  return order.customer_name ?? order.customer_phone ?? "Unknown customer";
}

function getFlashingCards(
  previous: DashboardMetrics | null,
  next: DashboardMetrics,
): MetricKey[] {
  if (!previous) return [];

  const changed: MetricKey[] = [];

  if (previous.totalOrders !== next.totalOrders) changed.push("totalOrders");
  if (previous.revenue !== next.revenue) changed.push("revenue");
  if (previous.pendingPayments !== next.pendingPayments) {
    changed.push("pendingPayments");
  }
  if (previous.confirmedOrders !== next.confirmedOrders) {
    changed.push("confirmedOrders");
  }

  return changed;
}

async function fetchDashboardFromApi(): Promise<{
  metrics: DashboardMetrics;
  recentOrders: RecentOrderRow[];
  returnMetrics: ReturnMetrics | null;
}> {
  const response = await fetch("/api/admin/dashboard", {
    cache: "no-store",
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(body?.error ?? `Request failed (${response.status})`);
  }

  return response.json() as Promise<{
    metrics: DashboardMetrics;
    recentOrders: RecentOrderRow[];
    returnMetrics: ReturnMetrics | null;
  }>;
}

export default function AdminDashboardPage() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [recentOrders, setRecentOrders] = useState<RecentOrderRow[]>([]);
  const [returnMetrics, setReturnMetrics] = useState<ReturnMetrics | null>(null);
  const [initialLoad, setInitialLoad] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);
  const [flashingCards, setFlashingCards] = useState<Set<MetricKey>>(
    new Set(),
  );
  const metricsRef = useRef<DashboardMetrics | null>(null);
  const flashTimeoutsRef = useRef<Map<MetricKey, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  const flashCards = useCallback((keys: MetricKey[]) => {
    if (keys.length === 0) return;

    setFlashingCards((current) => {
      const next = new Set(current);
      keys.forEach((key) => next.add(key));
      return next;
    });

    keys.forEach((key) => {
      const existing = flashTimeoutsRef.current.get(key);
      if (existing) clearTimeout(existing);

      const timeout = setTimeout(() => {
        setFlashingCards((current) => {
          const next = new Set(current);
          next.delete(key);
          return next;
        });
        flashTimeoutsRef.current.delete(key);
      }, 2500);

      flashTimeoutsRef.current.set(key, timeout);
    });
  }, []);

  const loadDashboard = useCallback(
    async (options?: { flashChanges?: boolean; silent?: boolean }) => {
      try {
        const { metrics: nextMetrics, recentOrders: nextRecentOrders, returnMetrics: nextReturnMetrics } =
          await fetchDashboardFromApi();

        if (options?.flashChanges) {
          flashCards(getFlashingCards(metricsRef.current, nextMetrics));
        }

        metricsRef.current = nextMetrics;
        setMetrics(nextMetrics);
        setRecentOrders(nextRecentOrders);
        setReturnMetrics(nextReturnMetrics);
        setDataError(null);
      } catch (loadError) {
        setDataError(
          loadError instanceof Error
            ? loadError.message
            : "Failed to load dashboard data.",
        );
      } finally {
        if (!options?.silent) {
          setInitialLoad(false);
        }
      }
    },
    [flashCards],
  );

  const handleRealtimeEvent = useCallback(
    (payload: RealtimePostgresChangesPayload<{ [key: string]: unknown }>) => {
      if (payload.eventType !== "INSERT" && payload.eventType !== "UPDATE") {
        return;
      }

      void loadDashboard({ flashChanges: true, silent: true });
    },
    [loadDashboard],
  );

  const { status: realtimeStatus } = useRealtimeSubscription({
    channelName: "admin-dashboard",
    table: "orders",
    onEvent: handleRealtimeEvent,
  });

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    const flashTimeouts = flashTimeoutsRef.current;
    return () => {
      flashTimeouts.forEach((timeout) => clearTimeout(timeout));
      flashTimeouts.clear();
    };
  }, []);

  const isLive = realtimeStatus === "connected";

  return (
    <div className="admin-page space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>
          <p className="mt-1 text-sm text-gray-500">
            Monitor orders, payments, shipments and conversations.
          </p>
        </div>
        <RealtimeStatusBadge status={realtimeStatus} />
      </div>

      {dataError ? (
        <ConnectionErrorBanner
          message={`Failed to load dashboard data: ${dataError}`}
          onRetry={() => void loadDashboard()}
        />
      ) : null}

      {realtimeStatus === "unavailable" && !dataError ? (
        <RealtimeUnavailableBanner />
      ) : null}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {initialLoad ? (
          <>
            <MetricCardSkeleton />
            <MetricCardSkeleton />
            <MetricCardSkeleton />
            <MetricCardSkeleton />
          </>
        ) : (
          <>
            <MetricCard
              flash={flashingCards.has("totalOrders")}
              live={isLive}
              value={
                <AnimatedCounter value={metrics?.totalOrders ?? 0} />
              }
              label="Total Orders"
              icon={
                <div className="rounded-lg bg-blue-50 p-2 text-blue-600">
                  <ShoppingBag className="size-5" />
                </div>
              }
            />
            <MetricCard
              flash={flashingCards.has("revenue")}
              live={isLive}
              value={
                <AnimatedCounter
                  value={metrics?.revenue ?? 0}
                  formatter={formatRevenue}
                />
              }
              label="Revenue"
              icon={
                <div className="flex size-9 items-center justify-center rounded-lg bg-green-50 p-2 text-lg font-bold text-green-600">
                  ₹
                </div>
              }
            />
            <MetricCard
              flash={flashingCards.has("pendingPayments")}
              live={isLive}
              value={
                <AnimatedCounter value={metrics?.pendingPayments ?? 0} />
              }
              label="Pending Payments"
              icon={
                <div className="rounded-lg bg-amber-50 p-2 text-amber-600">
                  <Clock className="size-5" />
                </div>
              }
            />
            <MetricCard
              flash={flashingCards.has("confirmedOrders")}
              live={isLive}
              value={
                <AnimatedCounter value={metrics?.confirmedOrders ?? 0} />
              }
              label="Confirmed Orders"
              icon={
                <div className="rounded-lg bg-purple-50 p-2 text-purple-600">
                  <CheckCircle className="size-5" />
                </div>
              }
            />
          </>
        )}
      </section>

      {returnMetrics ? (
        <section className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-base font-semibold text-gray-900">
                Return Management
              </h3>
              <p className="text-sm text-gray-500">
                Pending returns and workflow status across operations.
              </p>
            </div>
            <Button variant="outline" size="sm" asChild className="w-full sm:w-auto">
              <Link href="/admin/returns">Manage Returns</Link>
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {ADMIN_RETURN_SECTIONS.map((section) => (
              <Link
                key={section.key}
                href={`/admin/returns?status=${section.key}`}
                className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm transition-colors hover:border-green-200 hover:bg-green-50/30"
              >
                <div className="mb-2 rounded-lg bg-orange-50 p-2 text-orange-600 w-fit">
                  <PackageX className="size-4" />
                </div>
                <p className="text-2xl font-bold text-gray-900">
                  {returnMetrics[section.key]}
                </p>
                <p className="mt-1 text-xs text-gray-500">{section.label}</p>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-5 py-4">
          <h3 className="text-base font-semibold text-gray-900">
            Recent Orders
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/80 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                <th className="px-5 py-3">Order ID</th>
                <th className="px-5 py-3">Customer</th>
                <th className="px-5 py-3">Amount</th>
                <th className="px-5 py-3">Payment Status</th>
                <th className="px-5 py-3">Shipment Status</th>
                <th className="min-w-[7.5rem] whitespace-nowrap px-5 py-3">Date</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {initialLoad ? (
                <TableSkeleton rows={5} columns={7} />
              ) : recentOrders.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-5 py-8 text-center text-gray-500"
                  >
                    No orders yet.
                  </td>
                </tr>
              ) : (
                recentOrders.map((order) => {
                  const inconsistent = isInvalidOrderState(
                    order.payment_method,
                    order.payment_status,
                    order.shipment_status,
                  );
                  const awaitingCod = isAwaitingCodCollection(
                    order.payment_method,
                    order.payment_status,
                    order.shipment_status,
                  );
                  const codFailed = isCodCollectionFailed(
                    order.payment_method,
                    order.payment_status,
                  );
                  const upiVerificationPending = isUpiAwaitingVerification(
                    order.payment_method,
                    order.payment_status,
                  );

                  return (
                  <tr
                    key={order.id}
                    className={cn(
                      "border-b border-gray-50 last:border-0",
                      inconsistent && "bg-red-50/60",
                      codFailed && "bg-amber-100/70",
                      awaitingCod && !codFailed && "bg-amber-50/50",
                      upiVerificationPending && "bg-blue-50/50",
                    )}
                  >
                    <td className="px-5 py-4 font-medium text-gray-900">
                      {order.id}
                    </td>
                    <td className="px-5 py-4 text-gray-700">
                      {getCustomerLabel(order)}
                    </td>
                    <td className="px-5 py-4 text-gray-700">
                      {formatRevenue(order.total_amount)}
                    </td>
                    <td className="px-5 py-4">
                      <PaymentStatusChip
                        paymentMethod={order.payment_method}
                        status={order.payment_status}
                      />
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-col gap-1">
                        <ShipmentStatusChip status={order.shipment_status} />
                        {inconsistent ? (
                          <span className="text-[10px] font-medium text-red-600">
                            Ahead of payment
                          </span>
                        ) : codFailed ? (
                          <span className="text-[10px] font-medium text-amber-800">
                            COD not collected
                          </span>
                        ) : awaitingCod ? (
                          <span className="text-[10px] font-medium text-amber-700">
                            Awaiting COD collection
                          </span>
                        ) : upiVerificationPending ? (
                          <span className="text-[10px] font-medium text-blue-700">
                            UPI verification pending
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="min-w-[7.5rem] whitespace-nowrap px-5 py-4">
                      <AdminDateTimeCell iso={order.created_at} />
                    </td>
                    <td className="px-5 py-4 text-right">
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/admin/orders/${order.id}`}>Manage</Link>
                      </Button>
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
