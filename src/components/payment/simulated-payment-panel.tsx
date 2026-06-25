"use client";

import { useState } from "react";
import { CustomerPrimaryButton, CustomerSectionTitle } from "@/components/customer/customer-shell";
import { formatCurrency } from "@/lib/format";
import type { PaymentMethod } from "@/lib/payments/razorpay-client";
import { cn } from "@/lib/utils";

type SimulatedPaymentPanelProps = {
  method: Exclude<PaymentMethod, "cod">;
  amount: number;
  paying: boolean;
  onSuccess: (input: { transactionReference: string; upiId?: string }) => void;
  onFailure: () => void;
  onCancel: () => void;
};

export function SimulatedPaymentPanel({
  method,
  amount,
  paying,
  onSuccess,
  onFailure,
  onCancel,
}: SimulatedPaymentPanelProps) {
  const [upiId, setUpiId] = useState("");

  function handleSimulateSuccess() {
    const prefix = method === "upi" ? "DEMO-UPI" : "DEMO-CARD";
    onSuccess({
      transactionReference: `${prefix}-${Date.now().toString(36).toUpperCase()}`,
      upiId: method === "upi" ? upiId.trim() || "demo@upi" : undefined,
    });
  }

  return (
    <div className="rounded-[18px_18px_18px_4px] border border-amber-200 bg-amber-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <CustomerSectionTitle>Simulated Payment</CustomerSectionTitle>
        <span className="rounded-full bg-amber-200 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900">
          Demo
        </span>
      </div>

      <p className="mt-2 text-sm text-amber-950/80">
        Razorpay is not configured. This is a practice checkout — no real money
        moves until you connect live payment keys.
      </p>

      <div className="mt-4 rounded-xl border border-amber-100 bg-white p-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600">
            {method === "upi" ? "UPI payment" : "Card payment"}
          </span>
          <span className="font-semibold text-gray-900">{formatCurrency(amount)}</span>
        </div>

        {method === "upi" ? (
          <label className="mt-3 block">
            <span className="text-xs font-medium text-gray-500">UPI ID (optional)</span>
            <input
              type="text"
              value={upiId}
              onChange={(event) => setUpiId(event.target.value)}
              placeholder="yourname@upi"
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[var(--whatsapp-primary)]"
            />
          </label>
        ) : null}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={paying}
          onClick={onFailure}
          className={cn(
            "rounded-xl border border-red-200 bg-white px-3 py-2.5 text-sm font-semibold text-red-700 transition-colors",
            paying ? "opacity-60" : "hover:bg-red-50",
          )}
        >
          Simulate Failure
        </button>
        <CustomerPrimaryButton
          type="button"
          disabled={paying}
          onClick={handleSimulateSuccess}
          className="w-full"
        >
          {paying ? "Processing…" : "Simulate Success"}
        </CustomerPrimaryButton>
      </div>

      <button
        type="button"
        disabled={paying}
        onClick={onCancel}
        className="mt-3 w-full text-center text-xs text-amber-900/70 hover:text-amber-900"
      >
        Cancel
      </button>
    </div>
  );
}
