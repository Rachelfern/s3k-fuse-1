"use client";

import { CheckCircle2 } from "lucide-react";
import {
  CustomerCard,
  CustomerSectionTitle,
} from "@/components/customer/customer-shell";
import { PaymentScreenshotUpload } from "@/components/payment/payment-screenshot-upload";
import { formatCurrency } from "@/lib/format";

type UpiPaymentScreenshotStepProps = {
  orderId: string;
  totalAmount: number;
  customerId: string;
  onUploadingChange: (uploading: boolean) => void;
  onUploaded: () => void;
};

export function UpiPaymentScreenshotStep({
  orderId,
  totalAmount,
  customerId,
  onUploadingChange,
  onUploaded,
}: UpiPaymentScreenshotStepProps) {
  return (
    <CustomerCard>
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#DCF8C6]">
          <CheckCircle2 className="size-5 text-[var(--whatsapp-accent)]" />
        </div>
        <div className="min-w-0">
          <CustomerSectionTitle className="mb-1">
            Order received
          </CustomerSectionTitle>
          <p className="text-sm text-gray-600">
            Order{" "}
            <span className="break-all font-mono font-semibold text-gray-900">{orderId}</span>
            {" · "}
            {formatCurrency(totalAmount)}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Payment verification is pending until we review your screenshot.
          </p>
        </div>
      </div>

      <div className="mt-4">
        <PaymentScreenshotUpload
          orderId={orderId}
          customerId={customerId}
          onUploadingChange={onUploadingChange}
          onUploaded={() => onUploaded()}
        />
      </div>
    </CustomerCard>
  );
}
