"use client";

import { QuickReplyChips } from "@/components/chat/quick-reply-chips";
import { formatCurrency } from "@/lib/format";
import {
  parseCartActionIntent,
  type CartActionPayload,
} from "@/lib/chat/cart-action-messages";
import { cn } from "@/lib/utils";

interface CartActionBubbleProps {
  intent: string;
  content: string;
  time: string;
  disabled?: boolean;
  onQuickReply: (text: string) => void;
  onNavigate: (href: string) => void;
  className?: string;
}

function CartActionBody({
  payload,
  fallbackContent,
}: {
  payload: CartActionPayload;
  fallbackContent: string;
}) {
  switch (payload.type) {
    case "add": {
      const qty = payload.newQuantity ?? 1;
      const lineTotal =
        payload.lineTotal ?? (payload.unitPrice ?? 0) * qty;

      return (
        <>
          <p className="text-[13px] font-semibold text-[#065f46]">
            🛒 Added to Cart
          </p>
          <div className="mt-1.5 rounded-md bg-white/70 px-2 py-1.5">
            <p className="text-[13px] font-medium text-gray-900">
              {payload.productName} × {qty}
            </p>
            <p className="text-[13px] font-semibold text-[#128c7e]">
              {formatCurrency(lineTotal)}
            </p>
          </div>
        </>
      );
    }

    case "increment":
      return (
        <>
          <p className="text-[13px] font-semibold text-[#065f46]">
            ➕ Quantity Updated
          </p>
          <div className="mt-1.5 space-y-0.5">
            <p className="text-[13px] font-medium text-gray-900">
              {payload.productName}
            </p>
            <p className="text-[13px] tabular-nums text-gray-700">
              {payload.previousQuantity ?? 0} → {payload.newQuantity ?? 0}
            </p>
            <p className="text-[12px] text-[#047857]">
              Cart Total: {formatCurrency(payload.cartTotal)}
            </p>
          </div>
        </>
      );

    case "decrement":
      return (
        <>
          <p className="text-[13px] font-semibold text-[#065f46]">
            ➖ Quantity Updated
          </p>
          <div className="mt-1.5 space-y-0.5">
            <p className="text-[13px] font-medium text-gray-900">
              {payload.productName}
            </p>
            <p className="text-[13px] tabular-nums text-gray-700">
              {payload.previousQuantity ?? 0} → {payload.newQuantity ?? 0}
            </p>
            <p className="text-[12px] text-[#047857]">
              Cart Total: {formatCurrency(payload.cartTotal)}
            </p>
          </div>
        </>
      );

    case "remove":
      return (
        <>
          <p className="text-[13px] font-semibold text-[#991b1b]">
            ❌ Removed from Cart
          </p>
          <div className="mt-1.5 space-y-0.5">
            <p className="text-[13px] font-medium text-gray-900">
              {payload.productName}
            </p>
            <p className="text-[12px] text-[#047857]">
              Cart Total: {formatCurrency(payload.cartTotal)}
            </p>
          </div>
        </>
      );

    case "clear":
      return (
        <>
          <p className="text-[13px] font-semibold text-gray-800">
            🗑️ Cart Cleared
          </p>
          <p className="mt-1 text-[12px] text-gray-600">
            Your cart is now empty.
          </p>
        </>
      );

    default:
      return (
        <p className="whitespace-pre-wrap text-[14px] leading-snug">
          {fallbackContent}
        </p>
      );
  }
}

export function CartActionBubble({
  intent,
  content,
  time,
  disabled = false,
  onQuickReply,
  onNavigate,
  className,
}: CartActionBubbleProps) {
  const payload = parseCartActionIntent(intent);

  return (
    <div className={cn("chat-row-incoming", className)}>
      <div className="flex w-full min-w-0 flex-col items-start">
        <div className="chat-bubble-max w-fit">
          <div className="rounded-[18px_18px_18px_4px] border border-[#128c7e]/20 bg-[#ecfdf5]/90 px-2.5 py-2 text-gray-900 shadow-sm">
            {payload ? (
              <CartActionBody payload={payload} fallbackContent={content} />
            ) : (
              <p className="whitespace-pre-wrap text-[14px] leading-snug">
                {content}
              </p>
            )}
            <div className="mt-1 flex justify-end">
              <span className="text-[10px] text-gray-400">{time}</span>
            </div>
          </div>
        </div>

        {payload ? (
          <div className="chat-attachment-max w-fit">
            <QuickReplyChips
              intent={intent}
              content={content}
              disabled={disabled}
              onSelect={onQuickReply}
              onNavigate={onNavigate}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
