"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { CommerceErrorBoundary } from "@/components/error/commerce-error-boundary";
import { ReturnStatusTimeline } from "@/components/returns/return-status-timeline";
import { getCustomerSession } from "@/lib/chat/customer-storage";
import { formatOrderRef } from "@/lib/orders/return-request-flow";
import { formatReturnTrackingStatusLabel } from "@/lib/orders/return-status-timeline";
import type { ReturnRequest } from "@/lib/types";
import { cn } from "@/lib/utils";

function formatProcessedAt(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  }).format(new Date(iso));
}

export default function ReturnTrackingPage() {
  return (
    <CommerceErrorBoundary pageTitle="Return Tracking" backHref="/chat">
      <ReturnTrackingPageContent />
    </CommerceErrorBoundary>
  );
}

function ReturnTrackingPageContent() {
  const params = useParams<{ returnId: string }>();
  const returnId = params.returnId;
  const customerId = getCustomerSession().customerId;

  const [returnRequest, setReturnRequest] = useState<ReturnRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadReturn = useCallback(async () => {
    if (!customerId) {
      setError("Please connect in chat first.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/customer/return-requests?requestId=${encodeURIComponent(returnId)}&customerId=${encodeURIComponent(customerId)}`,
        { cache: "no-store" },
      );

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? "Failed to load return request.");
      }

      const data = (await response.json()) as { returnRequest?: ReturnRequest | null };
      if (!data.returnRequest) {
        setError("Return request not found.");
        setReturnRequest(null);
      } else {
        setReturnRequest(data.returnRequest);
      }
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Failed to load return request.",
      );
      setReturnRequest(null);
    } finally {
      setLoading(false);
    }
  }, [customerId, returnId]);

  useEffect(() => {
    void loadReturn();
  }, [loadReturn]);

  const orderRef = returnRequest ? formatOrderRef(returnRequest.order_id) : null;
  const isClosed = returnRequest?.status === "refunded";

  return (
    <div className="flex min-h-dvh min-w-0 flex-col overflow-x-hidden bg-[#E5DDD5]">
      <header className="flex h-14 shrink-0 items-center gap-3 bg-[var(--whatsapp-header)] px-4">
        <Link
          href="/chat"
          className="flex items-center gap-1 text-sm font-medium text-white transition-opacity hover:opacity-80"
          aria-label="Back to chat"
        >
          <ArrowLeft className="size-5" />
          <span className="hidden sm:inline">Back to Chat</span>
        </Link>

        <h1 className="min-w-0 flex-1 truncate text-sm font-semibold text-white">
          Return Tracking
        </h1>
      </header>

      <main className="whatsapp-pattern flex-1 overflow-y-auto px-4 py-4">
        {loading ? (
          <p className="py-8 text-center text-sm text-gray-500">
            Loading return request…
          </p>
        ) : error || !returnRequest ? (
          <div className="rounded-xl border border-gray-100 bg-white p-4 text-center">
            <p className="text-sm text-red-600">{error ?? "Return request not found."}</p>
            <Link
              href="/chat"
              className="mt-3 inline-block text-sm font-medium text-[var(--whatsapp-accent)]"
            >
              Back to chat
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-xl border border-gray-100 bg-white p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div className="min-w-0">
                  <p className="text-xs text-gray-400">RETURN REQUEST</p>
                  <p className="mt-0.5 break-all font-mono text-sm font-semibold text-gray-900">
                    {returnRequest.id}
                  </p>
                </div>
                <div className="sm:text-right">
                  <p className="text-xs text-gray-400">ORDER</p>
                  <Link
                    href={`/orders/${encodeURIComponent(returnRequest.order_id)}`}
                    className="mt-0.5 text-sm font-semibold text-[var(--whatsapp-accent)] hover:underline"
                  >
                    #{orderRef}
                  </Link>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-xs text-gray-500">Current Status:</span>
                <span
                  className={cn(
                    "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
                    isClosed
                      ? "bg-green-100 text-green-700"
                      : "bg-amber-100 text-amber-700",
                  )}
                >
                  {formatReturnTrackingStatusLabel(returnRequest.status)}
                </span>
              </div>
            </div>

            {returnRequest.refund_reference && returnRequest.refunded_at ? (
              <div className="rounded-xl border border-green-100 bg-green-50/50 p-4">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-green-700">
                  Refund Details
                </h2>
                <div className="mt-3 space-y-3 text-sm">
                  <div>
                    <p className="text-xs text-gray-500">Refund ID</p>
                    <p className="break-all font-mono font-semibold text-gray-900">
                      {returnRequest.refund_reference}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Processed On</p>
                    <p className="font-medium text-gray-900">
                      {formatProcessedAt(returnRequest.refunded_at)}
                    </p>
                  </div>
                </div>
              </div>
            ) : null}

            {returnRequest.pickup_reference &&
            !(returnRequest.refund_reference && returnRequest.refunded_at) ? (
              <div className="rounded-xl border border-gray-100 bg-white p-4">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                  References
                </h2>
                <div className="mt-3 space-y-3 text-sm">
                  {returnRequest.pickup_reference ? (
                    <div>
                      <p className="text-xs text-gray-500">Pickup Reference</p>
                      <p className="break-all font-mono font-semibold text-gray-900">
                        {returnRequest.pickup_reference}
                      </p>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {returnRequest.reason ? (
              <div className="rounded-xl border border-gray-100 bg-white p-4">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Return Reason
                </h2>
                <p className="mt-3 text-sm text-gray-700">{returnRequest.reason}</p>
              </div>
            ) : null}

            <ReturnStatusTimeline returnRequest={returnRequest} />

            <div className="rounded-xl border border-dashed border-gray-200 bg-white p-4 text-sm text-gray-500">
              Need delivery updates instead?{" "}
              <Link
                href={`/orders/${encodeURIComponent(returnRequest.order_id)}`}
                className="font-medium text-[var(--whatsapp-accent)] hover:underline"
              >
                Track order #{orderRef}
              </Link>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
