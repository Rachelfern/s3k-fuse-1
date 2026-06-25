"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useCommerceChat } from "@/hooks/use-commerce-chat";
import {
  buildCartUpdateMessage,
  buildOrderSuccessMessage,
  getInitialMessages,
  WELCOME_MESSAGE_ID,
} from "@/lib/mock/chat-responses";
import { useCart } from "@/hooks/use-cart";
import type { CartUpdateAction } from "@/lib/cart-utils";
import type { CartSnapshot } from "@/types/cart";
import type { ChatMessage } from "@/types/chat";

interface QueuedMessage {
  id: string;
  text: string;
}

interface ChatContextValue {
  messages: ChatMessage[];
  isTyping: boolean;
  handleSend: (text: string, messageId: string) => void;
  handleCartUpdated: (
    productName: string,
    nextSnapshot: CartSnapshot,
    action: CartUpdateAction
  ) => void;
  appendOrderSuccessMessage: (orderId: string, total: number) => void;
}

const ChatContext = createContext<ChatContextValue | null>(null);

function createMessageId() {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function ChatProvider({ children }: { children: ReactNode }) {
  const initialMessages = getInitialMessages();
  const messagesRef = useRef<ChatMessage[]>(initialMessages);
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [isTyping, setIsTyping] = useState(false);
  const { snapshot, applyCartUpdates } = useCart();
  const cartRef = useRef(snapshot);
  cartRef.current = snapshot;
  const announcedOrderIdsRef = useRef<Set<string>>(new Set());
  const queueRef = useRef<QueuedMessage[]>([]);
  const queuedIdsRef = useRef<Set<string>>(new Set());
  const isDrainingRef = useRef(false);

  const { sendMessage } = useCommerceChat({ applyCartUpdates });

  const updateMessages = useCallback(
    (updater: (prev: ChatMessage[]) => ChatMessage[]) => {
      setMessages((prev) => {
        const next = updater(prev);
        messagesRef.current = next;
        return next;
      });
    },
    []
  );

  useEffect(() => {
    updateMessages((prev) =>
      prev.map((message) =>
        message.id === WELCOME_MESSAGE_ID
          ? { ...message, createdAt: new Date().toISOString() }
          : message
      )
    );
  }, [updateMessages]);

  const appendAssistantMessage = useCallback(
    (content: string) => {
      const assistantMessage: ChatMessage = {
        id: createMessageId(),
        role: "assistant",
        content,
        createdAt: new Date().toISOString(),
      };
      updateMessages((prev) => [...prev, assistantMessage]);
    },
    [updateMessages]
  );

  const appendOrderSuccessMessage = useCallback(
    (orderId: string, total: number) => {
      if (announcedOrderIdsRef.current.has(orderId)) {
        return;
      }
      announcedOrderIdsRef.current.add(orderId);
      appendAssistantMessage(buildOrderSuccessMessage(orderId, total));
    },
    [appendAssistantMessage]
  );

  const handleCartUpdated = useCallback(
    (
      productName: string,
      nextSnapshot: CartSnapshot,
      action: CartUpdateAction
    ) => {
      cartRef.current = nextSnapshot;
      appendAssistantMessage(
        buildCartUpdateMessage(productName, nextSnapshot, action)
      );
    },
    [appendAssistantMessage]
  );

  const drainQueue = useCallback(async () => {
    if (isDrainingRef.current) {
      return;
    }

    isDrainingRef.current = true;
    setIsTyping(true);

    try {
      while (queueRef.current.length > 0) {
        const item = queueRef.current[0];
        const recentMessages = messagesRef.current.slice(-3);

        const { assistantMessage, nextCartSnapshot } = await sendMessage({
          message: item.text,
          cartSnapshot: cartRef.current,
          recentMessages,
        });

        queueRef.current.shift();
        queuedIdsRef.current.delete(item.id);
        cartRef.current = nextCartSnapshot;

        updateMessages((prev) => [
          ...prev,
          {
            id: createMessageId(),
            ...assistantMessage,
            createdAt: new Date().toISOString(),
          },
        ]);
      }
    } finally {
      isDrainingRef.current = false;
      setIsTyping(queueRef.current.length > 0);

      if (queueRef.current.length > 0) {
        void drainQueue();
      }
    }
  }, [sendMessage, updateMessages]);

  const handleSend = useCallback(
    (text: string, messageId: string) => {
      const trimmed = text.trim();
      if (!trimmed || queuedIdsRef.current.has(messageId)) {
        return;
      }

      const customerMessage: ChatMessage = {
        id: messageId,
        role: "customer",
        content: trimmed,
        createdAt: new Date().toISOString(),
      };

      queuedIdsRef.current.add(messageId);
      queueRef.current.push({ id: messageId, text: trimmed });
      updateMessages((prev) => [...prev, customerMessage]);

      void drainQueue();
    },
    [drainQueue, updateMessages]
  );

  const value = useMemo(
    () => ({
      messages,
      isTyping,
      handleSend,
      handleCartUpdated,
      appendOrderSuccessMessage,
    }),
    [
      messages,
      isTyping,
      handleSend,
      handleCartUpdated,
      appendOrderSuccessMessage,
    ]
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat(): ChatContextValue {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error("useChat must be used within ChatProvider");
  }
  return context;
}
