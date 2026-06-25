"use client";

import { useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Copy, Check } from "lucide-react";
import {
  CustomerPrimaryButton,
  CustomerSectionTitle,
} from "@/components/customer/customer-shell";
import { formatCurrency } from "@/lib/format";
import {
  buildUpiPaymentUri,
  UPI_MERCHANT_ID,
} from "@/lib/payments/upi-config";
import { cn } from "@/lib/utils";

type UpiQrPaymentPanelProps = {
  amount: number;
  orderReference: string;
  paying: boolean;
  onConfirmPaid: () => void;
};

export function UpiQrPaymentPanel({
  amount,
  orderReference,
  paying,
  onConfirmPaid,
}: UpiQrPaymentPanelProps) {
  const [copied, setCopied] = useState(false);

  const upiUri = useMemo(
    () =>
      buildUpiPaymentUri({
        amount,
        orderReference,
      }),
    [amount, orderReference],
  );

  async function handleCopyUpiId() {
    try {
      await navigator.clipboard.writeText(UPI_MERCHANT_ID);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("[UPI] Failed to copy UPI ID:", error);
    }
  }

  return (
    <div className="rounded-[18px_18px_18px_4px] border border-[#128c7e]/30 bg-[#ecfdf5] p-4">
      <CustomerSectionTitle>Pay via UPI</CustomerSectionTitle>

      <p className="mt-2 text-sm text-gray-600">
        Scan the QR code with GPay, PhonePe, or Paytm, then confirm once you&apos;ve
        paid.
      </p>

      <div className="mt-4 flex flex-col items-center rounded-xl border border-gray-100 bg-white p-4">
        <div className="w-full max-w-[12.5rem] rounded-lg border border-gray-100 bg-white p-3 shadow-sm">
          <QRCodeSVG
            value={upiUri}
            size={200}
            level="M"
            includeMargin
            className="h-auto w-full max-w-full"
            aria-label="UPI payment QR code"
          />
        </div>
        <p className="mt-3 text-sm font-semibold text-gray-900">
          {formatCurrency(amount)}
        </p>
        <p className="mt-1 text-xs text-gray-500">Order ref: {orderReference}</p>
      </div>

      <div className="mt-4 rounded-xl border border-gray-100 bg-white p-3">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
          UPI ID
        </p>
        <p className="mt-1 break-all font-mono text-sm font-semibold text-gray-900">
          {UPI_MERCHANT_ID}
        </p>
        <button
          type="button"
          onClick={() => void handleCopyUpiId()}
          className={cn(
            "mt-3 flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
            copied
              ? "border-green-200 bg-green-50 text-green-700"
              : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50",
          )}
        >
          {copied ? (
            <>
              <Check className="size-4" />
              Copied
            </>
          ) : (
            <>
              <Copy className="size-4" />
              Copy UPI ID
            </>
          )}
        </button>
      </div>

      <CustomerPrimaryButton
        type="button"
        disabled={paying}
        onClick={onConfirmPaid}
        className="mt-4 w-full"
      >
        {paying ? "Creating order…" : "I've Paid"}
      </CustomerPrimaryButton>
    </div>
  );
}
