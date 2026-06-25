"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { PackageX, RefreshCw } from "lucide-react";
import { AdminDateTimeCell } from "@/components/admin/admin-datetime-cell";
import { ConnectionErrorBanner } from "@/components/ui/connection-error-banner";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { Button } from "@/components/ui/button";
import {
  ADMIN_RETURN_SECTIONS,
  formatReturnStatusLabel,
  getAvailableAdminActions,
  RETURN_ACTION_LABELS,
  type AdminReturnSection,
  type ReturnAdminAction,
} from "@/lib/orders/return-status-timeline";
import type { ReturnRequestListRow } from "@/lib/orders/return-management-service";
import { cn } from "@/lib/utils";

async function fetchReturnsFromApi(status?: AdminReturnSection): Promise<{
  returns: ReturnRequestListRow[];
}> {
  const params = new URLSearchParams();
  if (status) params.set("status", status);

  const response = await fetch(
    `/api/admin/return-requests?${params.toString()}`,
    { cache: "no-store" },
  );

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(body?.error ?? `Request failed (${response.status})`);
  }

  return response.json() as Promise<{ returns: ReturnRequestListRow[] }>;
}

async function executeReturnActionViaApi(
  requestId: string,
  action: ReturnAdminAction,
  rejectReason?: string,
): Promise<void> {
  const response = await fetch(
    `/api/admin/return-requests/${encodeURIComponent(requestId)}/action`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, rejectReason }),
    },
  );

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(body?.error ?? `Request failed (${response.status})`);
  }
}

const STATUS_CHIP_STYLES: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-blue-100 text-blue-700",
  pickup_scheduled: "bg-purple-100 text-purple-700",
  picked_up: "bg-indigo-100 text-indigo-700",
  refunded: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
};

function ReturnStatusChip({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
        STATUS_CHIP_STYLES[status] ?? "bg-gray-100 text-gray-700",
      )}
    >
      {formatReturnStatusLabel(status)}
    </span>
  );
}

function ReturnActionButtons({
  row,
  onAction,
  acting,
}: {
  row: ReturnRequestListRow;
  onAction: (requestId: string, action: ReturnAdminAction) => Promise<void>;
  acting: string | null;
}) {
  const actions = getAvailableAdminActions(
    row.status as Parameters<typeof getAvailableAdminActions>[0],
  );

  if (actions.length === 0) {
    return <span className="text-xs text-gray-400">No actions</span>;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {actions.map((action) => (
        <Button
          key={action}
          type="button"
          size="sm"
          variant={action === "reject" ? "outline" : "default"}
          disabled={acting === row.id}
          className={cn(
            "h-7 text-xs",
            action === "reject" && "border-red-200 text-red-600 hover:bg-red-50",
            action !== "reject" && "bg-[var(--whatsapp-primary)] hover:bg-[var(--whatsapp-primary)]/90",
          )}
          onClick={() => void onAction(row.id, action)}
        >
          {RETURN_ACTION_LABELS[action]}
        </Button>
      ))}
    </div>
  );
}

export default function AdminReturnsPage() {
  return (
    <Suspense fallback={<AdminReturnsPageFallback />}>
      <AdminReturnsPageContent />
    </Suspense>
  );
}

function AdminReturnsPageFallback() {
  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="space-y-2">
        <div className="h-8 w-56 animate-pulse rounded bg-gray-200" />
        <div className="h-4 w-80 max-w-full animate-pulse rounded bg-gray-100" />
      </div>
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 5 }).map((_, index) => (
          <div
            key={index}
            className="h-8 w-24 animate-pulse rounded-full bg-gray-100"
          />
        ))}
      </div>
      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <TableSkeleton rows={5} columns={8} standalone />
      </section>
    </div>
  );
}

function AdminReturnsPageContent() {
  const searchParams = useSearchParams();
  const statusParam = searchParams.get("status") as AdminReturnSection | null;
  const initialSection =
    statusParam &&
    ADMIN_RETURN_SECTIONS.some((section) => section.key === statusParam)
      ? statusParam
      : "pending";

  const [returns, setReturns] = useState<ReturnRequestListRow[]>([]);
  const [activeSection, setActiveSection] = useState<AdminReturnSection>(initialSection);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const rejectPromptRef = useRef<string | null>(null);

  const loadReturns = useCallback(
    async (options?: { isRefresh?: boolean }) => {
      if (options?.isRefresh) setRefreshing(true);

      try {
        const data = await fetchReturnsFromApi(activeSection);
        setReturns(data.returns);
        setError(null);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Failed to load return requests.",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [activeSection],
  );

  const handleAction = useCallback(
    async (requestId: string, action: ReturnAdminAction) => {
      let rejectReason: string | undefined;

      if (action === "reject") {
        rejectReason =
          window.prompt("Reason for rejection (optional):")?.trim() ||
          "Does not meet return policy";
      }

      setActingId(requestId);
      try {
        await executeReturnActionViaApi(requestId, action, rejectReason);
        await loadReturns({ isRefresh: true });
        setError(null);
      } catch (actionError) {
        setError(
          actionError instanceof Error
            ? actionError.message
            : "Failed to update return request.",
        );
      } finally {
        setActingId(null);
        rejectPromptRef.current = null;
      }
    },
    [loadReturns],
  );

  useEffect(() => {
    void loadReturns();
  }, [loadReturns]);

  const sectionLabel =
    ADMIN_RETURN_SECTIONS.find((section) => section.key === activeSection)
      ?.label ?? "Returns";

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Return Management</h2>
          <p className="mt-1 text-sm text-gray-500">
            Review return requests, schedule mock courier pickups, and process
            refunds.
          </p>
        </div>

        <Button
          variant="outline"
          size="icon"
          onClick={() => void loadReturns({ isRefresh: true })}
          disabled={refreshing}
          aria-label="Refresh returns"
        >
          <RefreshCw className={cn("size-4", refreshing && "animate-spin")} />
        </Button>
      </div>

      {error ? (
        <ConnectionErrorBanner
          message={`Failed to load returns: ${error}`}
          onRetry={() => void loadReturns()}
        />
      ) : null}

      <div className="flex flex-wrap gap-2">
        {ADMIN_RETURN_SECTIONS.map((section) => (
          <button
            key={section.key}
            type="button"
            onClick={() => setActiveSection(section.key)}
            className={cn(
              "rounded-full border border-gray-200 px-4 py-1.5 text-sm transition-colors",
              activeSection === section.key
                ? "border-green-500 bg-green-500 text-white"
                : "bg-white text-gray-700 hover:bg-gray-50",
            )}
          >
            {section.label}
          </button>
        ))}
      </div>

      <p className="text-sm text-gray-500">
        {loading
          ? "Loading returns…"
          : `${returns.length} return${returns.length === 1 ? "" : "s"} in ${sectionLabel}`}
      </p>

      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50/80 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                <th className="px-5 py-3">Request ID</th>
                <th className="px-5 py-3">Order</th>
                <th className="px-5 py-3">Customer</th>
                <th className="px-5 py-3">Reason</th>
                <th className="px-5 py-3">Pickup Address</th>
                <th className="px-5 py-3">Status</th>
                <th className="min-w-[7.5rem] whitespace-nowrap px-5 py-3">Created</th>
                <th className="px-5 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <TableSkeleton rows={5} columns={8} />
              ) : returns.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-gray-500">
                    <PackageX className="mx-auto mb-2 size-8 text-gray-300" />
                    No returns in this section.
                  </td>
                </tr>
              ) : (
                returns.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-gray-100 last:border-0"
                  >
                    <td className="px-5 py-4 font-mono text-xs font-medium text-gray-900">
                      {row.id}
                    </td>
                    <td className="px-5 py-4">
                      <Link
                        href={`/admin/orders/${encodeURIComponent(row.order_id)}`}
                        className="font-medium text-[var(--whatsapp-accent)] hover:underline"
                      >
                        {row.order_id.slice(0, 12)}
                      </Link>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-medium text-gray-900">
                        {row.customer_name ?? "—"}
                      </p>
                      {row.phone ? (
                        <p className="text-xs text-gray-500">{row.phone}</p>
                      ) : null}
                    </td>
                    <td className="max-w-[160px] truncate px-5 py-4 text-gray-600">
                      {row.reason ?? "—"}
                    </td>
                    <td className="max-w-[180px] truncate px-5 py-4 text-gray-600">
                      {row.pickup_address ?? "—"}
                    </td>
                    <td className="px-5 py-4">
                      <ReturnStatusChip status={row.status} />
                      {row.pickup_reference ? (
                        <p className="mt-1 font-mono text-[10px] text-gray-400">
                          {row.pickup_reference}
                        </p>
                      ) : null}
                      {row.refund_reference ? (
                        <p className="mt-1 font-mono text-[10px] text-gray-400">
                          {row.refund_reference}
                        </p>
                      ) : null}
                    </td>
                    <td className="min-w-[7.5rem] whitespace-nowrap px-5 py-4">
                      <AdminDateTimeCell iso={row.created_at} />
                    </td>
                    <td className="px-5 py-4">
                      <ReturnActionButtons
                        row={row}
                        onAction={handleAction}
                        acting={actingId}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
