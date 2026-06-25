"use client";

import { parseReturnOrderCard } from "@/lib/chat/return-order-card";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";

type ReturnOrderMessageCardProps = {
  intent: string | null;
  content: string;
  createdAt: string;
};

export function ReturnOrderMessageCard({
  intent,
  content,
  createdAt,
}: ReturnOrderMessageCardProps) {
  const parsed = parseReturnOrderCard({ intent, content });

  if (!parsed) {
    return (
      <div className="w-full max-w-md min-w-0 rounded-[18px_18px_18px_4px] bg-white px-2.5 py-1.5 text-gray-900 shadow-sm">
        <p className="chat-bubble-content whitespace-pre-wrap text-[14px] leading-snug">
          {content}
        </p>
        <div className="mt-0.5 flex justify-end">
          <span className="text-[10px] text-gray-400">{formatTime(createdAt)}</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "w-full max-w-md min-w-0 overflow-hidden rounded-[18px_18px_18px_4px]",
        "border border-orange-200/80 bg-orange-50/95 shadow-sm",
      )}
    >
      <div className="border-b border-orange-200/60 px-3 py-2">
        <p className="text-[13px] font-semibold text-orange-900">
          📦 Latest Delivered Order
        </p>
      </div>

      <div className="space-y-2 px-3 py-2.5 text-[13px] leading-snug text-gray-800">
        <div className="space-y-0.5">
          <p>
            <span className="font-medium text-gray-600">Order ID:</span>{" "}
            {parsed.orderRef}
          </p>
          <p>
            <span className="font-medium text-gray-600">Delivered:</span>{" "}
            {parsed.deliveredLabel}
          </p>
        </div>

        {parsed.items.length > 0 ? (
          <div>
            <p className="mb-1 font-medium text-gray-600">Items:</p>
            <ul className="space-y-0.5">
              {parsed.items.map((item) => (
                <li key={item.label} className="flex gap-1.5">
                  <span className="text-orange-700">•</span>
                  <span>
                    {item.label} × {item.quantity}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <p className="pt-0.5 font-medium text-gray-700">Would you like to:</p>
      </div>

      <div className="flex justify-end px-3 pb-1.5">
        <span className="text-[10px] text-gray-400">{formatTime(createdAt)}</span>
      </div>
    </div>
  );
}

export { isReturnOrderCardIntent } from "@/lib/chat/return-order-card";
