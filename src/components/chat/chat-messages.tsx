"use client";

import type { CartUpdateAction } from "@/lib/cart-utils";
import type { CartSnapshot } from "@/types/cart";
import type { ChatMessage } from "@/types/chat";
import { ChatMessageBubble } from "./chat-message-bubble";
import { ChatTypingSkeleton } from "./chat-typing-skeleton";

interface ChatMessagesProps {
  messages: ChatMessage[];
  isTyping: boolean;
  onCartUpdated?: (
    productName: string,
    snapshot: CartSnapshot,
    action: CartUpdateAction
  ) => void;
}

export function ChatMessages({
  messages,
  isTyping,
  onCartUpdated,
}: ChatMessagesProps) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1 overflow-x-hidden overflow-y-auto px-2 py-2 md:px-4 lg:px-6">
      {messages.map((message) => (
        <ChatMessageBubble
          key={message.id}
          message={message}
          onCartUpdated={onCartUpdated}
        />
      ))}
      {isTyping && <ChatTypingSkeleton />}
    </div>
  );
}
