"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Check, ShoppingCart } from "lucide-react";
import { CommerceErrorBoundary } from "@/components/error/commerce-error-boundary";
import { PaymentScreenshotUpload } from "@/components/payment/payment-screenshot-upload";
import { PaymentRejectionRecovery } from "@/components/payment/payment-rejection-recovery";
import { COMMERCE_ROUTES } from "@/lib/chat/quick-replies";
import { getCustomerSession } from "@/lib/chat/customer-storage";
import { useSupabase } from "@/hooks/use-supabase";
import { useCart } from "@/hooks/use-cart";
import { formatCurrency } from "@/lib/format";
import {
  fetchOrderTracking,
  mapOrderTrackingUpdate,
  type OrderTrackingRow,
} from "@/lib/orders/fetch-order-tracking";
import {
  canCustomerRetryUpiPayment,
  canCustomerUploadPaymentScreenshot,
  formatCustomerPaymentStatus,
  formatShipmentStatusLabel,
  getTrackingProgress,
  getTrackingStepDescription,
  getTrackingStepTitle,
  isCodCollectionFailed,
  isCodDeliveredWithFailedCollection,
  TRACKING_STEPS,
} from "@/lib/orders/order-lifecycle";
import { serializeErrorForLog } from "@/lib/supabase/errors";
import type {
  OrderStatus,
  PaymentStatus,
  ReturnRequest,
  ShipmentStatus,
} from "@/lib/types";
import { cn } from "@/lib/utils";

const STATUS_CHIP: Record<
  OrderStatus,
  { label: string; className: string } | null
> = {
  new: {
    label: "New",
    className: "bg-blue-100 text-blue-600",
  },
  payment_pending: {
    label: "Payment Pending",
    className: "bg-red-100 text-red-600 font-semibold",
  },
  confirmed: {
    label: "Confirmed",
    className: "bg-green-100 text-green-600",
  },
  packed: {
    label: "Packed",
    className: "bg-purple-100 text-purple-600",
  },
  shipped: {
    label: "Shipped",
    className: "bg-blue-100 text-blue-600",
  },
  delivered: {
    label: "Delivered",
    className: "bg-green-500 text-white",
  },
  cancelled: {
    label: "Cancelled",
    className: "bg-red-500 text-white",
  },
};

const PAYMENT_STATUS_CHIP: Record<
  PaymentStatus,
  { label: string; className: string }
> = {
  pending: {
    label: "Pending",
    className: "bg-amber-100 text-amber-700",
  },
  verification_pending: {
    label: "Verification Pending",
    className: "bg-blue-100 text-blue-700",
  },
  retry_submitted: {
    label: "Retry Submitted",
    className: "bg-indigo-100 text-indigo-700",
  },
  rejected: {
    label: "Rejected",
    className: "bg-red-100 text-red-700",
  },
  verified: {
    label: "Verified",
    className: "bg-green-100 text-green-700",
  },
  failed: {
    label: "Failed",
    className: "bg-red-100 text-red-700",
  },
};

function formatPlacedOn(iso: string): { date: string; time: string } {
  const date = new Date(iso);
  return {
    date: new Intl.DateTimeFormat("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "Asia/Kolkata",
    }).format(date),
    time: new Intl.DateTimeFormat("en-IN", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "Asia/Kolkata",
    }).format(date),
  };
}

type StepState = "completed" | "current" | "upcoming" | "warning";

function getStepState(
  stepIndex: number,
  completedThrough: number,
  currentStep: number | null,
  options?: {
    codCollectionFailed?: boolean;
    deliveredWithFailedCollection?: boolean;
  },
): StepState {
  if (options?.codCollectionFailed && stepIndex === 2) {
    return "warning";
  }

  if (options?.deliveredWithFailedCollection && stepIndex === 5) {
    return "warning";
  }

  if (stepIndex <= completedThrough) return "completed";
  if (currentStep !== null && stepIndex === currentStep) return "current";
  return "upcoming";
}

function StepCircle({ state }: { state: StepState }) {
  if (state === "warning") {
    return (
      <div className="flex size-7 items-center justify-center rounded-full bg-amber-500 text-sm text-white ring-2 ring-amber-500 ring-offset-2">
        !
      </div>
    );
  }

  if (state === "completed") {
    return (
      <div className="flex size-7 items-center justify-center rounded-full bg-green-500 text-white">
        <Check className="size-4" strokeWidth={2.5} />
      </div>
    );
  }

  if (state === "current") {
    return (
      <div className="flex size-7 items-center justify-center rounded-full bg-green-500 text-white ring-2 ring-green-500 ring-offset-2 animate-pulse">
        <span className="size-2 rounded-full bg-white" />
      </div>
    );
  }

  return (
    <div className="flex size-7 items-center justify-center rounded-full border-2 border-gray-200 bg-white text-gray-300">
      <span className="size-2 rounded-full bg-gray-200" />
    </div>
  );
}

export default function OrderTrackingPage() {
  return (
    <CommerceErrorBoundary pageTitle="Order Tracking" backHref="/chat">
      <OrderTrackingPageContent />
    </CommerceErrorBoundary>
  );
}

function OrderTrackingPageContent() {
  const params = useParams<{ orderId: string }>();
  const orderId = params.orderId;
  const getSupabase = useSupabase();
  const { snapshot } = useCart();

  const [order, setOrder] = useState<OrderTrackingRow | null>(null);
  const [returnRequests, setReturnRequests] = useState<ReturnRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [postProcessingNotice, setPostProcessingNotice] = useState(false);
  const customerId = getCustomerSession().customerId;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setPostProcessingNotice(params.get("notice") === "post-processing");
  }, []);

  const loadOrder = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await fetchOrderTracking(
        getSupabase(),
        orderId,
      );

      if (fetchError) {
        console.error("[ORDER TRACKING] load failed:", serializeErrorForLog(fetchError));
        setError(fetchError.message);
        setOrder(null);
      } else if (!data) {
        setError("Order not found.");
        setOrder(null);
      } else {
        setOrder(data);

        if (customerId) {
          try {
            const returnsResponse = await fetch(
              `/api/customer/return-requests?orderId=${encodeURIComponent(orderId)}&customerId=${encodeURIComponent(customerId)}`,
              { cache: "no-store" },
            );
            if (returnsResponse.ok) {
              const returnsData = (await returnsResponse.json()) as {
                returns?: ReturnRequest[];
              };
              setReturnRequests(
                (returnsData.returns ?? []).filter(
                  (request) =>
                    request.status !== "awaiting_reason" &&
                    request.status !== "awaiting_photo",
                ),
              );
            }
          } catch {
            setReturnRequests([]);
          }
        }
      }
    } catch (loadError) {
      console.error(
        "[ORDER TRACKING] unexpected load error:",
        serializeErrorForLog(loadError),
      );
      setError(
        loadError instanceof Error ? loadError.message : "Failed to load order.",
      );
      setOrder(null);
    } finally {
      setLoading(false);
    }
  }, [getSupabase, orderId, customerId]);

  useEffect(() => {
    void loadOrder();
  }, [loadOrder]);

  useEffect(() => {
    const channel = getSupabase()
      .channel(`order-tracking:${orderId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "orders",
          filter: `id=eq.${orderId}`,
        },
        (payload) => {
          const updated = payload.new as Parameters<
            typeof mapOrderTrackingUpdate
          >[1];
          setOrder((current) => mapOrderTrackingUpdate(current, updated));
        },
      )
      .subscribe();

    return () => {
      void getSupabase().removeChannel(channel);
    };
  }, [getSupabase, orderId]);

  const progress = order ? getTrackingProgress(order) : null;
  const codCollectionFailed = order
    ? isCodCollectionFailed(order.payment_method, order.payment_status)
    : false;
  const codDeliveredWithFailedCollection = order
    ? isCodDeliveredWithFailedCollection(order)
    : false;
  const statusChip = order
    ? codCollectionFailed
      ? {
          label: codDeliveredWithFailedCollection
            ? "Delivered — Payment Issue"
            : "COD Payment Issue",
          className: "bg-amber-100 text-amber-800 font-semibold",
        }
      : STATUS_CHIP[order.status]
    : null;
  const placedOn = order ? formatPlacedOn(order.created_at) : null;

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
          Order Tracking 🚀
        </h1>

        <Link
          href="/cart"
          className="relative rounded-full p-2 text-white transition-colors hover:bg-white/10"
          aria-label="Cart"
        >
          <ShoppingCart className="size-5" />
          {snapshot.itemCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
              {snapshot.itemCount > 9 ? "9+" : snapshot.itemCount}
            </span>
          )}
        </Link>
      </header>

      <main className="whatsapp-pattern flex-1 overflow-y-auto px-4 py-4">
        {loading ? (
          <p className="py-8 text-center text-sm text-gray-500">
            Loading order…
          </p>
        ) : error || !order ? (
          <div className="rounded-xl border border-gray-100 bg-white p-4 text-center">
            <p className="text-sm text-red-600">{error ?? "Order not found."}</p>
            <Link
              href="/chat"
              className="mt-3 inline-block text-sm font-medium text-[var(--whatsapp-accent)]"
            >
              Back to chat
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {postProcessingNotice ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
                Payment received. Some post-processing is still completing.
              </div>
            ) : null}
            {codCollectionFailed ? (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
                <p className="font-semibold">⚠ COD Payment Not Collected</p>
                <p className="mt-1 text-amber-900/90">
                  Your Cash on Delivery payment could not be collected. Please
                  contact support or arrange another payment method.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link
                    href={COMMERCE_ROUTES.chat}
                    className="inline-flex rounded-full bg-[#128c7e] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#0f7a6d]"
                  >
                    Contact Support
                  </Link>
                  <Link
                    href={`${COMMERCE_ROUTES.payment}?orderId=${encodeURIComponent(order.id)}&retry=1`}
                    className="inline-flex rounded-full border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-950 hover:bg-amber-100/60"
                  >
                    Change Payment Method
                  </Link>
                </div>
              </div>
            ) : null}
            <div className="rounded-xl border border-gray-100 bg-white p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div className="min-w-0">
                  <p className="text-xs text-gray-400">ORDER ID</p>
                  <p className="mt-0.5 break-all font-mono text-sm font-semibold text-gray-900">
                    {order.id}
                  </p>
                </div>
                <div className="sm:text-right">
                  <p className="text-xs text-gray-400">TOTAL</p>
                  <p className="mt-0.5 text-sm font-bold text-gray-900">
                    {formatCurrency(order.total_amount)}
                  </p>
                </div>
              </div>

              {placedOn ? (
                <p className="mt-3 text-xs text-gray-400">
                  Placed on {placedOn.date} at {placedOn.time}
                </p>
              ) : null}

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-xs text-gray-500">Current Status:</span>
                {statusChip ? (
                  <span
                    className={cn(
                      "inline-flex rounded-full px-2.5 py-0.5 text-xs",
                      statusChip.className,
                    )}
                  >
                    {statusChip.label}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="rounded-xl border border-gray-100 bg-white p-4">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                Delivery Timeline
              </h2>

              <div className="relative mt-4">
                {TRACKING_STEPS.map((step, index) => {
                  const stepNumber = index + 1;
                  const state = progress
                    ? getStepState(
                        stepNumber,
                        progress.completedThrough,
                        progress.currentStep,
                        {
                          codCollectionFailed,
                          deliveredWithFailedCollection:
                            codDeliveredWithFailedCollection,
                        },
                      )
                    : "upcoming";
                  const connectorCompleted =
                    progress !== null && stepNumber <= progress.completedThrough;

                  return (
                    <div
                      key={step.title}
                      className={cn(
                        "relative",
                        index < TRACKING_STEPS.length - 1 ? "pb-8" : "",
                      )}
                    >
                      {index < TRACKING_STEPS.length - 1 ? (
                        <div
                          className={cn(
                            "absolute left-[13px] top-7 h-[calc(100%-12px)] w-0.5",
                            connectorCompleted ? "bg-green-200" : "bg-gray-200",
                          )}
                          aria-hidden
                        />
                      ) : null}

                      <div className="absolute left-0 top-0">
                        <StepCircle state={state} />
                      </div>

                      <div className="ml-11">
                        <p
                          className={cn(
                            "text-sm",
                            state === "completed" && "font-medium text-gray-900",
                            state === "current" &&
                              "font-semibold text-green-600",
                            state === "warning" &&
                              "font-semibold text-amber-700",
                            state === "upcoming" && "text-gray-400",
                          )}
                        >
                          {getTrackingStepTitle(index, order.payment_method)}
                        </p>
                        <p className="mt-0.5 text-xs text-gray-400">
                          {getTrackingStepDescription(index, order.payment_method)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-xl border border-gray-100 bg-white p-4">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                Shipment Status
              </h2>
              <p className="mt-3 text-sm font-medium text-gray-900">
                {formatShipmentStatusLabel(order.shipment_status)}
              </p>
            </div>

            <div className="mt-3 rounded-xl border border-gray-100 bg-white p-4">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                Payment Status
              </h2>
              <p className="mt-3 text-sm font-medium text-gray-900">
                {formatCustomerPaymentStatus(
                  order.payment_method,
                  order.payment_status,
                )}
              </p>

              <div className="mt-4 overflow-hidden rounded-lg border border-gray-100">
                <div className="grid grid-cols-1 border-b border-gray-100 bg-gray-50 text-xs font-medium text-gray-500 sm:grid-cols-2">
                  <div className="px-3 py-2">Transaction Ref</div>
                  <div className="border-t border-gray-100 px-3 py-2 sm:border-l sm:border-t-0">
                    Verification Status
                  </div>
                </div>
                <div className="grid grid-cols-1 text-sm sm:grid-cols-2">
                  <div className="break-all px-3 py-3 font-mono text-gray-900">
                    {order.payment_utr ?? "—"}
                  </div>
                  <div className="border-t border-gray-100 px-3 py-3 sm:border-l sm:border-t-0">
                    <span
                      className={cn(
                        "inline-flex rounded px-2 py-0.5 text-xs font-medium",
                        PAYMENT_STATUS_CHIP[order.payment_status].className,
                      )}
                    >
                      {formatCustomerPaymentStatus(
                        order.payment_method,
                        order.payment_status,
                      )}
                    </span>
                  </div>
                </div>
              </div>

              {canCustomerRetryUpiPayment(
                order.payment_method,
                order.payment_status,
                order.status,
              ) && customerId ? (
                <PaymentRejectionRecovery
                  orderId={order.id}
                  customerId={customerId}
                  totalAmount={order.total_amount}
                  rejectReason={order.payment_rejection_reason}
                  rejectedAt={order.payment_rejected_at}
                  onScreenshotUploaded={() => void loadOrder()}
                />
              ) : null}

              {canCustomerUploadPaymentScreenshot(
                order.payment_method,
                order.payment_status,
              ) &&
              order.payment_status !== "rejected" &&
              customerId ? (
                <div className="mt-4">
                  <PaymentScreenshotUpload
                    orderId={order.id}
                    customerId={customerId}
                    onUploaded={() => void loadOrder()}
                  />
                </div>
              ) : null}
            </div>

            {order.tracking_id ? (
              <div className="rounded-xl border border-gray-100 bg-white p-4">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Shipment
                </h2>
                <p className="mt-3 text-xs text-gray-500">Tracking ID</p>
                <p className="mt-0.5 font-mono text-sm font-semibold text-gray-900">
                  {order.tracking_id}
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-gray-200 bg-white p-4 text-sm text-gray-500">
                Shipment and tracking ID will appear after your order is packed
                and handed to a delivery partner.
              </div>
            )}

            {returnRequests.length > 0 ? (
              <div className="rounded-xl border border-amber-100 bg-amber-50 p-4">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-amber-800">
                  Active Return{returnRequests.length === 1 ? "" : "s"}
                </h2>
                <p className="mt-2 text-sm text-amber-950">
                  This order has an open return request. Delivery tracking below
                  is separate from your return workflow.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {returnRequests.map((returnRequest) => (
                    <Link
                      key={returnRequest.id}
                      href={COMMERCE_ROUTES.return(returnRequest.id)}
                      className="inline-flex rounded-full bg-white px-3 py-1.5 text-xs font-medium text-[var(--whatsapp-accent)] ring-1 ring-amber-200 hover:bg-amber-100/60"
                    >
                      Track Return · {returnRequest.id}
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </main>
    </div>
  );
}
