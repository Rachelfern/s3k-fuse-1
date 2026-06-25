"use client";

import { formatTime } from "@/lib/format";
import type { CartUpdateAction } from "@/lib/cart-utils";
import type { CartSnapshot } from "@/types/cart";
import type { ChatMessage } from "@/types/chat";
import { cn } from "@/lib/utils";
import { ChatProductCard } from "./chat-product-card";

interface ChatMessageBubbleProps {
  message: ChatMessage;
  onCartUpdated?: (
    productName: string,
    snapshot: CartSnapshot,
    action: CartUpdateAction
  ) => void;
}

export function ChatMessageBubble({
  message,
  onCartUpdated,
}: ChatMessageBubbleProps) {
  const isCustomer = message.role === "customer";

  return (
    <div className={isCustomer ? "chat-row-outgoing" : "chat-row-incoming"}>
      <div
        className={cn(
          "chat-bubble-max min-w-0 max-w-full w-fit overflow-hidden rounded-[18px] px-2.5 py-1.5 shadow-sm",
          isCustomer
            ? "rounded-br-[4px] bg-[#dcf8c6] text-gray-900"
            : "rounded-bl-[4px] bg-white text-gray-900",
        )}
      >
        <p className="chat-bubble-content whitespace-pre-wrap text-[14px] leading-snug">
          {message.content}
        </p>

        {message.productIds && message.productIds.length > 0 && (
          <ChatProductCard
            productIds={message.productIds}
            onCartUpdated={onCartUpdated}
          />
        )}

        <p
          className={cn(
            "mt-0.5 text-right text-[10px]",
            isCustomer ? "text-gray-500" : "text-gray-400",
          )}
        >
          {message.createdAt ? formatTime(message.createdAt) : null}
        </p>
      </div>
    </div>
  );
}
