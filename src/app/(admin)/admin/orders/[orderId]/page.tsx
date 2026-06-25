"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { AdminDateTimeCell } from "@/components/admin/admin-datetime-cell";
import { CodCollectionFailedBanner } from "@/components/admin/cod-collection-failed-banner";
import { ProductImage } from "@/components/product/product-image";
import {
  COURIER_OPTIONS,
  formatINR,
  formatPaymentMethodLabel,
  formatPaymentStatusLabel,
  formatShipmentStatusLabel,
  formatStatusLabel,
  isAwaitingCodCollection,
  isCodCollectionFailed,
  isCodDeliveredWithFailedCollection,
  isInvalidOrderState,
  isShipmentBlockedForOrder,
  ORDER_STATUS_CHIP_STYLES,
  PAYMENT_STATUS_CHIP_STYLES,
  SHIPMENT_STATUS_BLOCKED_TOOLTIP,
  SHIPMENT_STATUS_SELECT_STYLES,
} from "@/lib/admin/order-utils";
import type { OrderDetail, OrderUpdate } from "@/lib/admin/order-detail";
import { isUpiAwaitingVerification } from "@/lib/orders/order-lifecycle";
import { serializeErrorForLog } from "@/lib/supabase/errors";
import type { PaymentStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

async function fetchOrderDetailFromApi(orderId: string): Promise<OrderDetail | null> {
  const response = await fetch(`/api/admin/orders/${encodeURIComponent(orderId)}`, {
    cache: "no-store",
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(body?.error ?? `Request failed (${response.status})`);
  }

  const data = (await response.json()) as { order: OrderDetail };
  if (process.env.NODE_ENV === "development") {
    console.log("[ADMIN ORDER DETAIL]", { orderId, found: !!data.order });
  }
  return data.order;
}

async function updateOrderViaApi(
  orderId: string,
  fields: OrderUpdate,
): Promise<void> {
  const response = await fetch(`/api/admin/orders/${encodeURIComponent(orderId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fields),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(body?.error ?? `Request failed (${response.status})`);
  }
}

function SaveToast({ visible }: { visible: boolean }) {
  if (!visible) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white shadow-lg">
      Saved ✓
    </div>
  );
}

export default function AdminOrderDetailPage() {
  const params = useParams<{ orderId: string }>();
  const orderId = params.orderId;

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  const [trackingId, setTrackingId] = useState("");
  const [logisticsNotes, setLogisticsNotes] = useState("");
  const [verifyingPayment, setVerifyingPayment] = useState(false);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectError, setRejectError] = useState<string | null>(null);
  const [codActionBusy, setCodActionBusy] = useState(false);
  const [paymentScreenshotUrl, setPaymentScreenshotUrl] = useState<string | null>(
    null,
  );

  const showToast = useCallback(() => {
    setToastVisible(true);
    window.setTimeout(() => setToastVisible(false), 2000);
  }, []);

  const loadOrder = useCallback(async () => {
    if (!orderId) {
      setError("Order ID is missing from the URL.");
      setLoading(false);
      return;
    }

    if (process.env.NODE_ENV === "development") {
      console.log("[ADMIN ORDER DETAIL] Order ID:", orderId);
    }

    setLoading(true);
    try {
      const detail = await fetchOrderDetailFromApi(orderId);
      setOrder(detail);
      setTrackingId(detail?.tracking_id ?? "");
      setLogisticsNotes(detail?.notes ?? "");
      setError(detail ? null : "Order not found.");

      if (detail?.payment_screenshot_path) {
        const screenshotResponse = await fetch(
          `/api/admin/orders/${encodeURIComponent(orderId)}/payment-screenshot`,
          { cache: "no-store" },
        );
        if (screenshotResponse.ok) {
          const screenshotData = (await screenshotResponse.json()) as {
            url?: string | null;
          };
          setPaymentScreenshotUrl(screenshotData.url ?? null);
        } else {
          setPaymentScreenshotUrl(null);
        }
      } else {
        setPaymentScreenshotUrl(null);
      }
    } catch (loadError) {
      const message =
        loadError instanceof Error
          ? loadError.message
          : "Unable to load order details.";
      if (process.env.NODE_ENV === "development") {
        console.error("[ADMIN ORDER DETAIL] load failed:", {
          orderId,
          ...serializeErrorForLog(loadError),
        });
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    void loadOrder();
  }, [loadOrder]);

  const saveOrderFields = useCallback(
    async (fields: OrderUpdate) => {
      await updateOrderViaApi(orderId, fields);

      setOrder((current) =>
        current ? ({ ...current, ...fields } as OrderDetail) : current,
      );
      showToast();
    },
    [orderId, showToast],
  );

  async function handleCourierChange(courier: string) {
    try {
      await saveOrderFields({
        delivery_courier: courier === "" ? null : courier,
      });
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "Failed to save courier.",
      );
    }
  }

  async function handleTrackingBlur() {
    if (!order || trackingId === (order.tracking_id ?? "")) return;

    try {
      await saveOrderFields({
        tracking_id: trackingId.trim() === "" ? null : trackingId.trim(),
      });
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Failed to save tracking ID.",
      );
    }
  }

  async function handleNotesBlur() {
    if (!order || logisticsNotes === (order.notes ?? "")) return;

    try {
      await saveOrderFields({
        notes: logisticsNotes.trim() === "" ? null : logisticsNotes.trim(),
      });
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "Failed to save notes.",
      );
    }
  }

  async function handleUpiPaymentVerification(
    action: "verify" | "reject",
    reason?: string,
  ) {
    if (!order || verifyingPayment) return;

    setVerifyingPayment(true);
    setError(null);
    setRejectError(null);

    try {
      const response = await fetch(
        `/api/admin/orders/${encodeURIComponent(order.id)}/payment-verification`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            ...(action === "reject" ? { rejectReason: reason?.trim() } : {}),
          }),
        },
      );

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? `Request failed (${response.status})`);
      }

      setRejectModalOpen(false);
      setRejectReason("");
      await loadOrder();
      showToast();
    } catch (verifyError) {
      const message =
        verifyError instanceof Error
          ? verifyError.message
          : "Failed to update payment verification.";
      if (action === "reject" && rejectModalOpen) {
        setRejectError(message);
      } else {
        setError(message);
      }
    } finally {
      setVerifyingPayment(false);
    }
  }

  function openRejectModal() {
    setRejectReason("");
    setRejectError(null);
    setRejectModalOpen(true);
  }

  async function handlePaymentStatusChange(nextPaymentStatus: PaymentStatus) {
    try {
      await saveOrderFields({ payment_status: nextPaymentStatus });
      if (nextPaymentStatus === "failed") {
        await loadOrder();
      }
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Failed to save payment status.",
      );
    }
  }

  async function handleCodMarkCollected() {
    setCodActionBusy(true);
    try {
      await saveOrderFields({ payment_status: "verified" });
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Failed to mark payment as collected.",
      );
    } finally {
      setCodActionBusy(false);
    }
  }

  async function handleCodRescheduleCollection() {
    setCodActionBusy(true);
    try {
      await saveOrderFields({ payment_status: "pending" });
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Failed to reschedule collection.",
      );
    } finally {
      setCodActionBusy(false);
    }
  }

  async function handleCodCancelOrder() {
    if (
      !window.confirm(
        "Cancel this order? The customer will no longer be able to complete COD collection.",
      )
    ) {
      return;
    }

    setCodActionBusy(true);
    try {
      await saveOrderFields({ status: "cancelled" });
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Failed to cancel order.",
      );
    } finally {
      setCodActionBusy(false);
    }
  }

  const itemsSubtotal =
    order?.items.reduce(
      (sum, item) => sum + item.price_snapshot * item.quantity,
      0,
    ) ??
    (order ? order.total_amount - order.delivery_fee : 0);

  const deliveryAddress =
    order?.delivery_address ?? order?.customer_address ?? "—";

  const shipmentBlocked = order
    ? isShipmentBlockedForOrder(order.payment_method, order.payment_status)
    : false;
  const stateInconsistent = order
    ? isInvalidOrderState(
        order.payment_method,
        order.payment_status,
        order.shipment_status,
      )
    : false;
  const awaitingCodCollection = order
    ? isAwaitingCodCollection(
        order.payment_method,
        order.payment_status,
        order.shipment_status,
      )
    : false;
  const codCollectionFailed = order
    ? isCodCollectionFailed(order.payment_method, order.payment_status)
    : false;
  const codDeliveredWithFailedCollection = order
    ? isCodDeliveredWithFailedCollection(order)
    : false;
  const upiVerificationPending = order
    ? isUpiAwaitingVerification(order.payment_method, order.payment_status)
    : false;

  if (loading) {
    return (
      <div className="p-6 text-sm text-gray-500">Loading order…</div>
    );
  }

  if (!order) {
    return (
      <div className="space-y-4 p-6">
        <Link
          href="/admin/orders"
          className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="size-4" />
          Back to orders
        </Link>
        <p className="text-sm text-red-600">{error ?? "Order not found."}</p>
      </div>
    );
  }

  return (
    <>
      <SaveToast visible={toastVisible} />

      {rejectModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <h3 className="text-base font-semibold text-gray-900">
              Reject payment verification
            </h3>
            <p className="mt-1 text-sm text-gray-600">
              Tell the customer why the payment could not be verified. They will
              receive a chat notification and can retry without rebuilding their cart.
            </p>
            <textarea
              value={rejectReason}
              onChange={(event) => setRejectReason(event.target.value)}
              rows={4}
              placeholder="e.g. Screenshot amount does not match order total"
              className="mt-4 w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
            />
            {rejectError ? (
              <p className="mt-2 text-xs text-red-600">{rejectError}</p>
            ) : null}
            <div className="mt-4 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={verifyingPayment}
                onClick={() => setRejectModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={verifyingPayment || !rejectReason.trim()}
                onClick={() =>
                  void handleUpiPaymentVerification("reject", rejectReason)
                }
                className="bg-red-600 hover:bg-red-700"
              >
                Reject Payment
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="admin-page">
        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {codCollectionFailed ? (
          <CodCollectionFailedBanner
            delivered={codDeliveredWithFailedCollection}
            customerId={order.customer_id}
            busy={codActionBusy}
            onMarkCollected={() => void handleCodMarkCollected()}
            onRescheduleCollection={() => void handleCodRescheduleCollection()}
            onCancelOrder={() => void handleCodCancelOrder()}
          />
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/admin/orders"
              className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
              aria-label="Back to orders"
            >
              <ArrowLeft className="size-5" />
            </Link>
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-lg text-gray-500">Order</span>
              <span className="font-mono text-lg font-semibold text-green-500">
                {order.id}
              </span>
              <span className="inline-flex items-center gap-1 text-gray-400">
                ·
                <AdminDateTimeCell iso={order.created_at} size="sm" />
              </span>
            </div>
          </div>

          <span
            className={cn(
              "inline-flex rounded-full px-3 py-1.5 text-sm font-medium capitalize",
              ORDER_STATUS_CHIP_STYLES[order.status],
            )}
          >
            {formatStatusLabel(order.status)}
          </span>
        </div>

        <div className="flex flex-col gap-6 lg:flex-row">
          <div className="min-w-0 flex-1 space-y-4">
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                👤 Customer Information
              </h3>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-gray-400">Contact Name</p>
                  <p className="mt-1 text-sm font-medium text-gray-900">
                    {order.customer_name ?? "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Mobile Phone</p>
                  <p className="mt-1 text-sm font-medium text-gray-900">
                    {order.customer_phone ?? "—"}
                  </p>
                </div>
              </div>
              <div className="mt-4 border-t border-gray-100 pt-4">
                <p className="text-xs text-gray-400">Delivery Destination</p>
                <p className="mt-1 text-sm text-gray-700">{deliveryAddress}</p>
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                📋 Ordered Items
              </h3>

              {order.items.length === 0 ? (
                <p className="mt-4 text-sm text-gray-500">
                  Line items unavailable for this order.
                </p>
              ) : (
                <ul className="mt-4 space-y-3">
                  {order.items.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-center gap-3"
                    >
                      <ProductImage
                        productId={item.product_id ?? item.id}
                        name={item.product_name}
                        imageUrl={item.image_url}
                        size="xs"
                        className="rounded-lg"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900">
                          {item.product_name}
                        </p>
                        <p className="text-xs text-gray-400">
                          Qty: {item.quantity}
                        </p>
                      </div>
                      <p className="text-sm font-medium text-gray-900">
                        {formatINR(item.price_snapshot * item.quantity)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-4 border-t border-gray-200 pt-4 space-y-2">
                <div className="flex justify-between text-sm text-gray-600">
                  <span>Subtotal</span>
                  <span>{formatINR(itemsSubtotal)}</span>
                </div>
                <div className="flex justify-between text-sm text-gray-600">
                  <span>Delivery Charge</span>
                  <span>{formatINR(order.delivery_fee)}</span>
                </div>
                <div className="flex justify-between text-base font-bold text-gray-900">
                  <span>Grand Total</span>
                  <span>{formatINR(order.total_amount)}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="w-full shrink-0 space-y-4 lg:w-72">
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                💳 Payment Audit
              </h3>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-gray-400">Payment Method</p>
                  <p className="mt-1 text-sm font-medium text-gray-900">
                    {formatPaymentMethodLabel(order.payment_method)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Transaction UTR</p>
                  <p className="mt-1 font-mono text-sm text-gray-900">
                    {order.payment_utr ?? "—"}
                  </p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-gray-400">Payment Status</p>
                  {order.payment_method === "cod" ? (
                    <select
                      value={order.payment_status}
                      onChange={(event) =>
                        void handlePaymentStatusChange(
                          event.target.value as PaymentStatus,
                        )
                      }
                      className={cn(
                        "mt-1 w-full rounded-lg border px-3 py-2 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-green-500",
                        PAYMENT_STATUS_CHIP_STYLES[order.payment_status],
                      )}
                    >
                      <option value="pending">Pending</option>
                      <option value="verified">Collected</option>
                      <option value="failed">Failed Collection</option>
                    </select>
                  ) : (
                    <span
                      className={cn(
                        "mt-1 inline-flex rounded px-2 py-0.5 text-xs font-medium",
                        PAYMENT_STATUS_CHIP_STYLES[order.payment_status],
                      )}
                    >
                      {formatPaymentStatusLabel(
                        order.payment_method,
                        order.payment_status,
                      )}
                    </span>
                  )}
                </div>
              </div>
              {upiVerificationPending ? (
                <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3">
                  <p className="text-xs font-medium text-blue-800">
                    {order.payment_status === "retry_submitted"
                      ? "UPI Retry Submitted"
                      : "UPI Verification Pending"}
                  </p>
                  <p className="mt-1 text-xs text-blue-700/80">
                    {order.payment_status === "retry_submitted"
                      ? "Customer resubmitted payment proof. Review the latest screenshot before approving."
                      : "Review the payment screenshot or check your UPI app / bank statement before approving."}
                  </p>
                  {order.payment_retry_submitted_at ? (
                    <p className="mt-2 text-[10px] text-blue-700/70">
                      Retry submitted{" "}
                      {new Intl.DateTimeFormat("en-IN", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }).format(new Date(order.payment_retry_submitted_at))}
                    </p>
                  ) : null}
                  {paymentScreenshotUrl ? (
                    <div className="mt-3 overflow-hidden rounded-lg border border-blue-100 bg-white p-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={paymentScreenshotUrl}
                        alt="Customer UPI payment screenshot"
                        className="max-h-64 w-full object-contain"
                      />
                      {order.payment_screenshot_uploaded_at ? (
                        <p className="mt-2 text-[10px] text-gray-500">
                          Uploaded{" "}
                          {new Intl.DateTimeFormat("en-IN", {
                            dateStyle: "medium",
                            timeStyle: "short",
                          }).format(new Date(order.payment_screenshot_uploaded_at))}
                        </p>
                      ) : null}
                    </div>
                  ) : order.payment_screenshot_path ? (
                    <p className="mt-2 text-xs text-amber-700">
                      Screenshot uploaded but preview unavailable.
                    </p>
                  ) : (
                    <p className="mt-2 text-xs text-blue-700/70">
                      No payment screenshot uploaded yet.
                    </p>
                  )}
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <Button
                      type="button"
                      size="sm"
                      disabled={verifyingPayment}
                      onClick={() => void handleUpiPaymentVerification("verify")}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      Verify Payment
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={verifyingPayment}
                      onClick={openRejectModal}
                      className="border-red-200 text-red-700 hover:bg-red-50"
                    >
                      Reject Payment
                    </Button>
                  </div>
                </div>
              ) : order.payment_status === "rejected" ? (
                <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3">
                  <p className="text-xs font-medium text-red-800">Payment Rejected</p>
                  {order.payment_rejection_reason ? (
                    <p className="mt-1 text-xs text-red-700">
                      Reason: {order.payment_rejection_reason}
                    </p>
                  ) : null}
                  {order.payment_rejected_at ? (
                    <p className="mt-2 text-[10px] text-red-700/70">
                      Rejected{" "}
                      {new Intl.DateTimeFormat("en-IN", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }).format(new Date(order.payment_rejected_at))}
                    </p>
                  ) : null}
                  <p className="mt-2 text-xs text-red-700/80">
                    Customer has been notified and can retry payment without
                    rebuilding their cart.
                  </p>
                </div>
              ) : null}
            </div>

            <div
              className={cn(
                "rounded-xl border bg-white p-5",
                stateInconsistent
                  ? "border-red-300 bg-red-50/40"
                  : codCollectionFailed
                    ? "border-amber-300 bg-amber-50/40"
                    : awaitingCodCollection
                      ? "border-amber-200 bg-amber-50/40"
                      : "border-gray-200",
              )}
            >
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                📦 Order State
              </h3>
              {stateInconsistent ? (
                <p className="mt-2 text-xs font-medium text-red-600">
                  Inconsistent state: shipment is ahead of payment verification.
                </p>
              ) : codCollectionFailed ? (
                <p className="mt-2 text-xs font-medium text-amber-800">
                  COD collection failed — resolve payment before treating this order
                  as complete.
                </p>
              ) : awaitingCodCollection ? (
                <p className="mt-2 text-xs font-medium text-amber-700">
                  Awaiting COD collection
                </p>
              ) : null}
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-gray-400">Payment Status</p>
                  <span
                    className={cn(
                      "mt-1 inline-flex rounded px-2 py-0.5 text-xs font-medium",
                      PAYMENT_STATUS_CHIP_STYLES[order.payment_status],
                    )}
                  >
                    {formatPaymentStatusLabel(
                      order.payment_method,
                      order.payment_status,
                    )}
                  </span>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Shipment Status</p>
                  <span
                    className={cn(
                      "mt-1 inline-flex rounded px-2 py-0.5 text-xs font-medium capitalize",
                      SHIPMENT_STATUS_SELECT_STYLES[order.shipment_status],
                    )}
                  >
                    {formatShipmentStatusLabel(order.shipment_status)}
                  </span>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                🚚 Logistics &amp; Shipments
              </h3>

              <div className="mt-4 space-y-4">
                <div>
                  <label
                    htmlFor="delivery-courier"
                    className="text-xs text-gray-400"
                  >
                    Delivery Courier
                  </label>
                  <select
                    id="delivery-courier"
                    value={order.delivery_courier ?? ""}
                    onChange={(event) => void handleCourierChange(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                  >
                    <option value="">Select courier</option>
                    {COURIER_OPTIONS.map((courier) => (
                      <option key={courier} value={courier}>
                        {courier}
                      </option>
                    ))}
                    {order.delivery_courier &&
                    !COURIER_OPTIONS.includes(
                      order.delivery_courier as (typeof COURIER_OPTIONS)[number],
                    ) ? (
                      <option value={order.delivery_courier}>
                        {order.delivery_courier}
                      </option>
                    ) : null}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="tracking-id"
                    className="text-xs text-gray-400"
                  >
                    Tracking Reference ID
                  </label>
                  <input
                    id="tracking-id"
                    type="text"
                    value={trackingId}
                    onChange={(event) => setTrackingId(event.target.value)}
                    onBlur={() => void handleTrackingBlur()}
                    placeholder="Enter tracking ID"
                    className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                  />
                </div>

                <div>
                  <p className="text-xs text-gray-400">Shipment Status</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        "inline-flex rounded px-2 py-0.5 text-xs font-medium capitalize",
                        SHIPMENT_STATUS_SELECT_STYLES[order.shipment_status],
                      )}
                    >
                      {formatShipmentStatusLabel(order.shipment_status)}
                    </span>
                    <Link
                      href="/admin/shipments"
                      className="text-xs font-medium text-green-600 hover:text-green-700"
                    >
                      Manage in Shipments →
                    </Link>
                  </div>
                  {shipmentBlocked ? (
                    <p className="mt-1.5 text-xs text-amber-700">
                      {SHIPMENT_STATUS_BLOCKED_TOOLTIP}
                    </p>
                  ) : null}
                </div>

                <div>
                  <label
                    htmlFor="logistics-notes"
                    className="text-xs text-gray-400"
                  >
                    Logistics Notes
                  </label>
                  <textarea
                    id="logistics-notes"
                    rows={3}
                    value={logisticsNotes}
                    onChange={(event) => setLogisticsNotes(event.target.value)}
                    onBlur={() => void handleNotesBlur()}
                    placeholder="Add delivery notes…"
                    className="mt-1 w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
