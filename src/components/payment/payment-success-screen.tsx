"use client";

import { useEffect } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import {
  CustomerCard,
  CustomerPrimaryLink,
  CustomerShell,
} from "@/components/customer/customer-shell";
import { buildChatOrderSuccessUrl } from "@/lib/chat/order-success";

type PaymentSuccessScreenProps = {
  orderId: string;
  totalAmount: number;
  variant: "payment" | "order";
  redirectDelayMs?: number;
  chatHref?: string;
};

export function PaymentSuccessScreen({
  orderId,
  totalAmount,
  variant,
  redirectDelayMs = 5000,
  chatHref: chatHrefProp,
}: PaymentSuccessScreenProps) {
  const chatHref =
    chatHrefProp ?? buildChatOrderSuccessUrl(orderId, totalAmount);

  let title = variant === "payment" ? "Payment Successful" : "Order Placed";
  if (chatHrefProp?.includes("paymentSubmitted=1")) {
    title = "Payment Submitted";
  } else if (chatHrefProp?.includes("paymentRetry=1") && variant === "order") {
    title = "Payment Method Updated";
  } else if (chatHrefProp?.includes("paymentRetry=1")) {
    title = "Payment Retry Submitted";
  }

  useEffect(() => {
    try {
      const timer = window.setTimeout(() => {
        try {
          window.location.assign(chatHref);
        } catch (redirectError) {
          console.error("[CHECKOUT] Auto-redirect to chat failed:", redirectError);
        }
      }, redirectDelayMs);

      return () => window.clearTimeout(timer);
    } catch (error) {
      console.error("[CHECKOUT] Payment success redirect setup failed:", error);
      return undefined;
    }
  }, [chatHref, redirectDelayMs]);

  return (
    <CustomerShell
      backHref="/chat"
      backLabel="Back to chat"
      subtitle={title}
      quickActions={
        <Link
          href="/chat"
          className="whitespace-nowrap rounded-full border border-[#128c7e]/40 bg-white px-2.5 py-0.5 text-[11px] font-medium leading-tight text-[#075e54] shadow-sm transition-colors hover:bg-[#ecfdf5]"
        >
          ← Back to Chat
        </Link>
      }
      footer={
        <CustomerPrimaryLink href={chatHref}>Return to Chat</CustomerPrimaryLink>
      }
    >
      <CustomerCard className="py-8 text-center">
        <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-[#DCF8C6]">
          <CheckCircle2 className="size-9 text-[var(--whatsapp-accent)]" />
        </div>
        <h1 className="text-lg font-bold text-gray-900">✅ {title}</h1>
        <p className="mt-2 text-sm text-gray-600">
          Order ID:{" "}
          <span className="break-all font-mono font-semibold text-gray-900">{orderId}</span>
        </p>
        <p className="mt-4 text-xs text-gray-500">
          Returning to chat in a moment…
        </p>
      </CustomerCard>
    </CustomerShell>
  );
}
