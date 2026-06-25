"use client";

import Link from "next/link";
import { AlertCircle } from "lucide-react";
import {
  CustomerPrimaryLink,
  CustomerQuickLink,
} from "@/components/customer/customer-shell";
import { PaymentScreenshotUpload } from "@/components/payment/payment-screenshot-upload";
import { COMMERCE_ROUTES } from "@/lib/chat/quick-replies";
import { formatCurrency } from "@/lib/format";

type PaymentRejectionRecoveryProps = {
  orderId: string;
  customerId: string;
  totalAmount: number;
  rejectReason: string | null;
  rejectedAt: string | null;
  onScreenshotUploaded?: () => void;
};

function formatRejectedAt(iso: string | null): string | null {
  if (!iso) return null;
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(iso));
}

export function PaymentRejectionRecovery({
  orderId,
  customerId,
  totalAmount,
  rejectReason,
  rejectedAt,
  onScreenshotUploaded,
}: PaymentRejectionRecoveryProps) {
  const rejectedLabel = formatRejectedAt(rejectedAt);

  return (
    <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 size-5 shrink-0 text-red-600" />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-red-900">
            Payment could not be verified
          </h3>
          <p className="mt-1 text-sm text-red-800/90">
            Your order for {formatCurrency(totalAmount)} is saved. Choose a different
            payment method or retry with updated payment details.
          </p>
          {rejectReason ? (
            <p className="mt-2 rounded-lg border border-red-100 bg-white/80 px-3 py-2 text-sm text-red-900">
              <span className="font-medium">Reason:</span> {rejectReason}
            </p>
          ) : null}
          {rejectedLabel ? (
            <p className="mt-2 text-xs text-red-700/80">Rejected {rejectedLabel}</p>
          ) : null}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <CustomerPrimaryLink
          href={`${COMMERCE_ROUTES.payment}?orderId=${encodeURIComponent(orderId)}&retry=1`}
        >
          Retry Payment
        </CustomerPrimaryLink>
        <CustomerQuickLink href={COMMERCE_ROUTES.order(orderId)}>
          View Order
        </CustomerQuickLink>
        <Link
          href={COMMERCE_ROUTES.chat}
          className="inline-flex items-center rounded-full border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-800 hover:bg-red-100/60"
        >
          Contact Support
        </Link>
      </div>

      <div className="mt-4">
        <PaymentScreenshotUpload
          orderId={orderId}
          customerId={customerId}
          instruction="If you still want to pay via UPI, upload a new payment screenshot for verification."
          onUploaded={() => onScreenshotUploaded?.()}
        />
      </div>
    </div>
  );
}
