"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { CheckCircle2 } from "lucide-react";
import {
  CustomerCard,
  CustomerPrimaryButton,
  CustomerQuickLink,
  CustomerSectionTitle,
  CustomerShell,
} from "@/components/customer/customer-shell";
import { useCheckout } from "@/hooks/use-checkout";
import { formatCurrency, formatTime } from "@/lib/format";

export default function OrderConfirmationPage() {
  const router = useRouter();
  const { completedOrder } = useCheckout();

  useEffect(() => {
    if (!completedOrder) {
      router.replace("/chat");
    }
  }, [completedOrder, router]);

  if (!completedOrder) {
    return null;
  }

  const itemCount = completedOrder.items.reduce(
    (sum, item) => sum + item.quantity,
    0,
  );

  return (
    <CustomerShell
      backHref="/chat"
      backLabel="Back to chat"
      subtitle="Order Confirmed"
      quickActions={
        <CustomerQuickLink href="/products">🛒 Order Again</CustomerQuickLink>
      }
      footer={
        <CustomerPrimaryButton type="button" onClick={() => router.push("/chat")}>
          Back to Chat
        </CustomerPrimaryButton>
      }
    >
      <div className="space-y-3">
        <CustomerCard className="text-center">
          <div className="mx-auto mb-3 flex size-16 items-center justify-center rounded-full bg-[#DCF8C6]">
            <CheckCircle2 className="size-9 text-[var(--whatsapp-accent)]" />
          </div>
          <h1 className="text-lg font-bold text-gray-900">
            Thank you for your order!
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            Your payment was received. We&apos;ll send updates on WhatsApp.
          </p>
          <p className="mt-4 text-xs font-medium uppercase tracking-wide text-gray-400">
            Order ID
          </p>
          <p className="break-all font-mono text-sm font-semibold text-[var(--whatsapp-accent)]">
            {completedOrder.orderId}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Placed at {formatTime(completedOrder.placedAt)}
          </p>
        </CustomerCard>

        <CustomerCard>
          <CustomerSectionTitle>Delivery to</CustomerSectionTitle>
          <p className="text-sm font-medium text-gray-900">
            {completedOrder.checkout.name}
          </p>
          <p className="text-sm text-gray-500">
            {completedOrder.checkout.phone}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-gray-700">
            {completedOrder.checkout.address}
          </p>
        </CustomerCard>

        <CustomerCard>
          <CustomerSectionTitle>Order summary</CustomerSectionTitle>
          <ul className="space-y-2 text-sm">
            {completedOrder.items.map((item) => (
              <li
                key={item.productId}
                className="flex items-center justify-between gap-3"
              >
                <span className="min-w-0 break-words text-gray-900">
                  {item.product.name} ×{item.quantity}
                </span>
                <span className="font-medium text-[var(--whatsapp-accent)]">
                  {formatCurrency(item.lineSubtotal)}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-3">
            <span className="font-medium text-gray-500">
              Total ({itemCount} {itemCount === 1 ? "item" : "items"})
            </span>
            <span className="text-lg font-bold text-[var(--whatsapp-accent)]">
              {formatCurrency(completedOrder.subtotal)}
            </span>
          </div>
        </CustomerCard>

        <CustomerCard>
          <CustomerSectionTitle>Payment</CustomerSectionTitle>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-gray-500">UPI ID</dt>
              <dd className="break-all text-right font-medium text-gray-900">
                {completedOrder.payment.upiId}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-gray-500">Amount paid</dt>
              <dd className="font-semibold text-[var(--whatsapp-accent)]">
                {formatCurrency(completedOrder.subtotal)}
              </dd>
            </div>
          </dl>
        </CustomerCard>
      </div>
    </CustomerShell>
  );
}
