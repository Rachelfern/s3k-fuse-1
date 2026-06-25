"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Mic,
  MoreVertical,
  Paperclip,
  Send,
} from "lucide-react";
import { useSupabase } from "@/hooks/use-supabase";
import { BUSINESS_ID } from "@/lib/demo";
import { formatCurrency, formatTime } from "@/lib/format";
import {
  generatePhone,
  getCustomerSession,
  isValidUuid,
  saveCustomerSession,
  saveVaartaProfile,
  type CustomerSession,
} from "@/lib/chat/customer-storage";
import {
  getChatStateCache,
  saveChatStateCache,
  clearChatStateCache,
} from "@/lib/chat/chat-state-cache";
import { useCart } from "@/hooks/use-cart";
import { RecommendationProductCards } from "@/components/chat/recommendation-product-cards";
import { ChatStatusEventCard } from "@/components/chat/chat-status-event-card";
import { ReturnOrderMessageCard } from "@/components/returns/return-order-message-card";
import { isReturnOrderCardIntent } from "@/lib/chat/return-order-card";
import {
  isChatStatusEventIntent,
  isPaymentStatusMessageIntent,
} from "@/lib/chat/status-event-card";
import { shouldShowProductCards } from "@/lib/ai/intent-categories";
import { CartActionBubble } from "@/components/chat/cart-action-bubble";
import { QuickReplyChips } from "@/components/chat/quick-reply-chips";
import { CartQuickActions } from "@/components/chat/cart-quick-actions";
import { ChatTypingIndicator } from "@/components/chat/chat-typing-indicator";
import { parseRecommendationProductIds } from "@/lib/ai/message-intent";
import { sanitizeAssistantResponse } from "@/lib/ai/response-validation";
import {
  buildCartActionPayload,
  encodeCartActionIntent,
  formatCartActionContent,
  isCartActionIntent,
  parseCartUndoMessage,
} from "@/lib/chat/cart-action-messages";
import { formatCustomerBubbleContent } from "@/lib/chat/message-display";
import {
  ensureOrderSuccessChatMessage,
  parseChatOrderSuccessParams,
} from "@/lib/chat/order-success";
import {
  ensurePaymentRetryChatMessage,
  ensurePaymentSubmittedChatMessage,
  parseChatPaymentRetryParams,
  parseChatPaymentSubmittedParams,
} from "@/lib/orders/payment-retry-flow";
import { fetchJson, isNetworkFetchError } from "@/lib/fetch-json";
import { useInStockProducts } from "@/hooks/use-in-stock-products";
import {
  dedupeMessages,
  getQuickActionKey,
  shouldSkipDuplicateQuickAction,
} from "@/lib/chat/quick-action-dedup";
import { CHAT_RESPONSE_FALLBACK_MESSAGE } from "@/lib/chat/chat-errors";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import type { Message } from "@/lib/types";
import {
  diagnoseSupabaseError,
  isMissingColumnError,
  isStaleChatSessionError,
  serializeErrorForLog,
} from "@/lib/supabase/errors";
import { CustomerOnboardingSheet } from "@/components/customer/customer-onboarding-sheet";
import {
  saveDpdpConsent,
  syncDpdpConsentFromServer,
  clearDpdpConsent,
} from "@/lib/dpdp/consent-storage";
import {
  resetLocalCustomerJourney,
  resetLocalCustomerJourneyAfterDeletion,
} from "@/lib/dpdp/reset-local-journey";
import { cn } from "@/lib/utils";
import { STORE_INITIALS, STORE_NAME } from "@/lib/brand";

const TYPING_MESSAGE_ID = "__typing__";

const SAMPLE_PROMPTS = [
  "Show me protein powders",
  "Do you have wireless headphones?",
  "What's your return policy?",
  "Recommend a gift under ₹1000",
  "Show today's offers",
];

function buildWelcomeContent(name: string) {
  const firstName = name.trim().split(/\s+/)[0] || name;
  return `👋 Hi ${firstName}!

Welcome to ${STORE_NAME}.

I can help you shop, track orders, and answer product questions — all right here in chat.

Tap a quick reply below or type your question.`;
}

function isToday(iso: string) {
  const date = new Date(iso);
  const today = new Date();
  return (
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear()
  );
}

function MessageBubble({
  message,
  onQuickReply,
  onNavigate,
  onSamplePrompt,
  disabled,
  productNames,
}: {
  message: Message;
  onQuickReply: (text: string) => void;
  onNavigate: (href: string) => void;
  onSamplePrompt: (text: string) => void;
  disabled: boolean;
  productNames: Map<string, string>;
}) {
  if (message.content === "__typing__" && message.sender_type === "admin") {
    return <ChatTypingIndicator />;
  }

  const time = formatTime(message.created_at);

  if (message.sender_type === "system") {
    const useStatusCardLayout =
      isChatStatusEventIntent(message.intent) ||
      isPaymentStatusMessageIntent(message.intent);

    return (
      <div className="chat-row-incoming px-1">
        <div className="flex w-full max-w-full min-w-0 flex-col items-stretch">
          <ChatStatusEventCard
            intent={message.intent}
            content={message.content}
            createdAt={message.created_at}
          />
          {message.intent ? (
            <QuickReplyChips
              intent={message.intent}
              content={message.content}
              disabled={disabled}
              onSelect={onQuickReply}
              onNavigate={onNavigate}
              className={
                useStatusCardLayout ? "mt-1 w-full justify-start" : undefined
              }
            />
          ) : null}
        </div>
      </div>
    );
  }

  if (message.sender_type === "customer") {
    const displayContent = formatCustomerBubbleContent(
      message.content,
      productNames,
    );

    return (
      <div className="chat-row-outgoing">
        <div className="chat-bubble-max min-w-0 max-w-full w-fit">
          <div className="overflow-hidden rounded-[18px_18px_4px_18px] bg-[#dcf8c6] px-2.5 py-1.5 text-gray-900 shadow-sm">
            <p className="chat-bubble-content whitespace-pre-wrap text-[14px] leading-snug">
              {displayContent}
            </p>
            <div className="mt-0.5 flex items-center justify-end gap-0.5">
              <span className="text-[10px] text-gray-500">{time}</span>
              <span className="text-[10px] text-[#53bdeb]">✓✓</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const isAi = message.was_ai_drafted;
  const recommendedProductIds = parseRecommendationProductIds(message.intent);
  const isReturnOrderCard = isReturnOrderCardIntent(message.intent);

  if (message.intent && isCartActionIntent(message.intent)) {
    return (
      <CartActionBubble
        intent={message.intent}
        content={message.content}
        time={time}
        disabled={disabled}
        onQuickReply={onQuickReply}
        onNavigate={onNavigate}
      />
    );
  }

  const displayContent =
    isAi && message.sender_type === "admin"
      ? sanitizeAssistantResponse(message.content)
      : message.content;

  return (
    <div className="chat-row-incoming">
      <div className="flex w-full min-w-0 flex-col items-start">
        {isAi && (
          <p className="mb-0.5 text-[10px] text-[#128c7e]">🤖 AI Assistant</p>
        )}
        <div className="chat-bubble-max min-w-0 max-w-full w-fit overflow-hidden">
          {isReturnOrderCard ? (
            <ReturnOrderMessageCard
              intent={message.intent}
              content={message.content}
              createdAt={message.created_at}
            />
          ) : (
            <div className="rounded-[18px_18px_18px_4px] bg-white px-2.5 py-1.5 text-gray-900 shadow-sm">
              <p className="chat-bubble-content whitespace-pre-wrap text-[14px] leading-snug">
                {displayContent}
              </p>
              <div className="mt-0.5 flex justify-end">
                <span className="text-[10px] text-gray-400">{time}</span>
              </div>
            </div>
          )}
        </div>

        {shouldShowProductCards(message.intent) && recommendedProductIds.length > 0 && (
          <div className="chat-attachment-max w-full">
            <RecommendationProductCards
              productIds={recommendedProductIds}
              disabled={disabled}
              onNavigate={onNavigate}
            />
          </div>
        )}

        {message.intent && message.intent !== "welcome_samples" && (
          <div
            className={cn(
              "chat-attachment-max w-fit",
              isReturnOrderCard && "max-w-md w-full",
            )}
          >
            <QuickReplyChips
              intent={message.intent}
              content={message.content}
              disabled={disabled}
              onSelect={onQuickReply}
              onNavigate={onNavigate}
            />
          </div>
        )}

        {message.intent === "welcome_samples" && (
          <div className="chat-attachment-max mt-1.5 flex w-fit flex-wrap gap-1">
            {SAMPLE_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                disabled={disabled}
                onClick={() => onSamplePrompt(prompt)}
                className={cn(
                  "rounded-full border border-[#128c7e]/40 bg-white px-2.5 py-0.5 text-[11px] font-medium leading-tight text-[#075e54] shadow-sm transition-colors hover:bg-[#ecfdf5]",
                  disabled && "cursor-not-allowed opacity-50",
                )}
              >
                {prompt}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ChatPage() {
  const router = useRouter();
  const getSupabase = useSupabase();
  const { snapshot, applyCartUpdates, clearCart, lastMutation, recordCartMutation } =
    useCart();
  const { products } = useInStockProducts();

  const productNames = useMemo(
    () => new Map(products.map((product) => [product.id, product.name_en])),
    [products],
  );

  const [session, setSession] = useState<Partial<CustomerSession>>({});
  const [showWelcome, setShowWelcome] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [inputText, setInputText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const {
    state: speechState,
    errorMessage: speechError,
    isSupported: speechSupported,
    startListening,
    cancelListening,
    clearError: clearSpeechError,
  } = useSpeechRecognition();

  const threadRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const messageIdsRef = useRef<Set<string>>(new Set());
  const messagesRef = useRef<Message[]>([]);
  const inFlightActionsRef = useRef<Set<string>>(new Set());
  const processingRequestsRef = useRef<Set<string>>(new Set());
  const sessionRef = useRef<Partial<CustomerSession>>({});
  const lastCartMutationAtRef = useRef<number | null>(null);
  const userScrolledUpRef = useRef(false);
  const initialScrollDoneRef = useRef(false);
  const restoredFromCacheRef = useRef(false);
  const shouldInstantScrollRef = useRef(false);

  const NEAR_BOTTOM_THRESHOLD = 150;

  sessionRef.current = session;
  messagesRef.current = messages;

  const scrollToBottomInstant = useCallback(() => {
    const thread = threadRef.current;
    if (thread) {
      thread.scrollTop = thread.scrollHeight;
    }
  }, []);

  const isNearBottom = useCallback(() => {
    const thread = threadRef.current;
    if (!thread) return true;
    const distanceFromBottom =
      thread.scrollHeight - thread.scrollTop - thread.clientHeight;
    return distanceFromBottom <= NEAR_BOTTOM_THRESHOLD;
  }, []);

  const handleThreadScroll = useCallback(() => {
    userScrolledUpRef.current = !isNearBottom();
  }, [isNearBottom]);

  const scrollToBottom = useCallback(
    (force = false) => {
      if (!force && userScrolledUpRef.current) return;

      bottomRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "end",
      });

      if (force) {
        userScrolledUpRef.current = false;
      }
    },
    [],
  );

  const persistChatState = useCallback(() => {
    const conversationId = sessionRef.current.conversationId;
    if (!conversationId) return;

    const persistable = messagesRef.current.filter(
      (message) => message.id !== TYPING_MESSAGE_ID,
    );
    if (persistable.length === 0) return;

    const latest = persistable[persistable.length - 1];
    const thread = threadRef.current;

    saveChatStateCache({
      conversationId,
      messages: persistable,
      latestMessageId: latest.id,
      scrollTop: thread?.scrollTop ?? 0,
      savedAt: Date.now(),
    });
  }, []);

  const addMessage = useCallback((message: Message) => {
    if (messageIdsRef.current.has(message.id)) return;
    messageIdsRef.current.add(message.id);
    setMessages((prev) =>
      dedupeMessages(
        [...prev, message].sort(
          (a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
        ),
      ),
    );
  }, []);

  const loadMessages = useCallback(
    async (conversationId: string, customerName?: string) => {
      setLoadingMessages(true);
      const { data, error } = await getSupabase()
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });

      if (error) {
        console.error("[chat/messages] failed to load messages", error);
        setLoadingMessages(false);
        return;
      }

      messageIdsRef.current.clear();
      let rows = data ?? [];

      if (rows.length === 0 && customerName) {
        const { data: conversation } = await getSupabase()
          .from("conversations")
          .select("id")
          .eq("id", conversationId)
          .maybeSingle();

        if (!conversation) {
          throw new Error(
            `Conversation ${conversationId} not found — session may be stale`,
          );
        }

        const welcomePayload = [
          {
            conversation_id: conversationId,
            sender_type: "admin" as const,
            content: buildWelcomeContent(customerName),
            intent: "welcome",
            was_ai_drafted: false,
          },
          {
            conversation_id: conversationId,
            sender_type: "admin" as const,
            content: "You can also ask me anything. Try:",
            intent: "welcome_samples",
            was_ai_drafted: false,
          },
        ];

        const { data: inserted, error: welcomeError } = await getSupabase()
          .from("messages")
          .insert(welcomePayload)
          .select("*");

        if (welcomeError) {
          console.error(
            "[chat/messages] welcome message insert failed",
            diagnoseSupabaseError(welcomeError),
            {
              code: welcomeError.code,
              details: welcomeError.details,
              hint: welcomeError.hint,
            },
          );
          throw welcomeError;
        } else if (inserted) {
          console.log("[chat/messages] welcome messages inserted", {
            count: inserted.length,
          });
          rows = inserted;
        }
      }

      rows.forEach((row) => messageIdsRef.current.add(row.id));
      setMessages(rows);
      setLoadingMessages(false);
    },
    [getSupabase],
  );

  const syncMessages = useCallback(
    async (
      conversationId: string,
      existingMessages: Message[],
    ): Promise<{ adminRepliesAdded: number }> => {
      const persistable = existingMessages.filter(
        (message) => message.id !== TYPING_MESSAGE_ID,
      );
      const latestCreatedAt = persistable.reduce(
        (max, message) =>
          message.created_at > max ? message.created_at : max,
        "",
      );

      const { data, error } = await getSupabase()
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .gt("created_at", latestCreatedAt || "1970-01-01T00:00:00.000Z")
        .order("created_at", { ascending: true });

      if (error) {
        console.error("[CHAT] sync messages failed:", error);
        return { adminRepliesAdded: 0 };
      }

      if (!data?.length) {
        return { adminRepliesAdded: 0 };
      }

      const merged = [...persistable];
      let adminRepliesAdded = 0;

      for (const row of data) {
        if (!messageIdsRef.current.has(row.id)) {
          messageIdsRef.current.add(row.id);
          merged.push(row);
          if (row.sender_type === "admin") {
            adminRepliesAdded += 1;
          }
        }
      }

      merged.sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );
      shouldInstantScrollRef.current = true;
      setMessages(merged);

      if (adminRepliesAdded > 0) {
        console.log("[CHAT] bot messages synced from database", {
          adminRepliesAdded,
        });
      }

      return { adminRepliesAdded };
    },
    [getSupabase],
  );

  const resolveOrCreateConversation = useCallback(
    async (customerId: string): Promise<string | null> => {
      const supabase = getSupabase();
      const stored = getCustomerSession();

      const { data: customer, error: customerError } = await supabase
        .from("customers")
        .select("id")
        .eq("id", customerId)
        .maybeSingle();

      if (customerError) throw customerError;
      if (!customer) return null;

      if (stored.conversationId && isValidUuid(stored.conversationId)) {
        const { data: existing, error: existingError } = await supabase
          .from("conversations")
          .select("id")
          .eq("id", stored.conversationId)
          .eq("customer_id", customerId)
          .maybeSingle();

        if (existingError) throw existingError;
        if (existing) return existing.id;
      }

      const { data: latest, error: latestError } = await supabase
        .from("conversations")
        .select("id")
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestError) throw latestError;
      if (latest) return latest.id;

      const { data: created, error: createError } = await supabase
        .from("conversations")
        .insert({
          business_id: BUSINESS_ID,
          customer_id: customerId,
        })
        .select("id")
        .single();

      if (createError) throw createError;
      return created.id;
    },
    [getSupabase],
  );

  useLayoutEffect(() => {
    if (!shouldInstantScrollRef.current) return;
    if (isLoading || loadingMessages || messages.length === 0) return;

    scrollToBottomInstant();
    shouldInstantScrollRef.current = false;
    initialScrollDoneRef.current = true;
    userScrolledUpRef.current = false;
  }, [messages, isLoading, loadingMessages, scrollToBottomInstant]);

  useEffect(() => {
    async function init() {
      const stored = getCustomerSession();

      if (!stored.customerId) {
        setShowWelcome(true);
        setIsLoading(false);
        return;
      }

      if (!isValidUuid(stored.customerId)) {
        resetLocalCustomerJourney();
        setShowWelcome(true);
        setIsLoading(false);
        return;
      }

      try {
        const profileResponse = await fetch(
          `/api/customer/profile?customerId=${encodeURIComponent(stored.customerId)}`,
        );

        if (!profileResponse.ok) {
          if (profileResponse.status === 404) {
            resetLocalCustomerJourney();
            setShowWelcome(true);
            setIsLoading(false);
            return;
          }

          const body = (await profileResponse.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(body?.error ?? "Failed to load customer profile");
        }

        const profile = (await profileResponse.json()) as {
          dpdpConsent?: boolean;
          dpdpConsentAt?: string | null;
          deletionStatus?: string;
        };

        if (profile.deletionStatus === "deleted") {
          resetLocalCustomerJourneyAfterDeletion();
          clearCart();
          messageIdsRef.current.clear();
          setMessages([]);
          setSession({});
          restoredFromCacheRef.current = false;
          setShowWelcome(true);
          setIsLoading(false);
          return;
        }

        if (!profile.dpdpConsent) {
          clearDpdpConsent();
          resetLocalCustomerJourney();
          clearCart();
          messageIdsRef.current.clear();
          setMessages([]);
          setSession({});
          restoredFromCacheRef.current = false;
          setShowWelcome(true);
          setIsLoading(false);
          return;
        }

        syncDpdpConsentFromServer(true, profile.dpdpConsentAt ?? null);

        const conversationId = await resolveOrCreateConversation(
          stored.customerId,
        );

        if (!conversationId) {
          if (process.env.NODE_ENV === "development") {
            console.warn(
              "[chat/init] stale session — customer not in database, clearing",
            );
          }
          resetLocalCustomerJourney();
          setShowWelcome(true);
          setIsLoading(false);
          return;
        }

        const nextSession: CustomerSession = {
          customerId: stored.customerId,
          conversationId,
          customerName: stored.customerName ?? "",
          phone: stored.phone ?? "",
        };

        saveCustomerSession(nextSession);
        setSession(nextSession);
        setShowWelcome(false);

        const cached =
          stored.conversationId === conversationId
            ? getChatStateCache(conversationId)
            : null;

        if (cached?.messages.length) {
          const filtered = cached.messages.filter(
            (message) => message.id !== TYPING_MESSAGE_ID,
          );
          messageIdsRef.current = new Set(filtered.map((message) => message.id));
          setMessages(filtered);
          restoredFromCacheRef.current = true;
          shouldInstantScrollRef.current = true;
          await syncMessages(conversationId, filtered);
        } else {
          if (stored.conversationId) {
            clearChatStateCache(stored.conversationId);
          }
          await loadMessages(conversationId, stored.customerName);
          shouldInstantScrollRef.current = true;
        }
      } catch (error) {
        const logPayload = {
          ...serializeErrorForLog(error),
          summary: diagnoseSupabaseError(error),
        };

        if (isStaleChatSessionError(error)) {
          if (process.env.NODE_ENV === "development") {
            console.warn("[chat/init] stale session cleared", logPayload);
          }
        } else {
          console.error("[chat/init] session restore failed", logPayload);
        }

        resetLocalCustomerJourney();
        messageIdsRef.current.clear();
        setMessages([]);
        setSession({});
        restoredFromCacheRef.current = false;
        setShowWelcome(true);
      }

      setIsLoading(false);
    }

    void init();
  }, [loadMessages, resolveOrCreateConversation, syncMessages]);

  useEffect(() => {
    if (isLoading || showWelcome || !session.conversationId) return;
    persistChatState();
  }, [messages, isLoading, showWelcome, session.conversationId, persistChatState]);

  useEffect(() => {
    return () => {
      persistChatState();
    };
  }, [persistChatState]);

  useEffect(() => {
    if (isLoading || !session.conversationId || showWelcome) return;

    const submittedParams = parseChatPaymentSubmittedParams(window.location.search);
    if (submittedParams) {
      let cancelled = false;

      void (async () => {
        try {
          const message = await ensurePaymentSubmittedChatMessage(getSupabase(), {
            conversationId: session.conversationId!,
            orderId: submittedParams.orderId,
            totalAmount: submittedParams.totalAmount,
          });

          if (cancelled || !message) return;

          addMessage(message);
          router.replace("/chat", { scroll: false });
        } catch (error) {
          console.error("[chat/payment-submitted] failed to insert confirmation", error);
        }
      })();

      return () => {
        cancelled = true;
      };
    }

    const retryParams = parseChatPaymentRetryParams(window.location.search);
    if (retryParams) {
      let cancelled = false;

      void (async () => {
        try {
          const message = await ensurePaymentRetryChatMessage(getSupabase(), {
            conversationId: session.conversationId!,
            orderId: retryParams.orderId,
            totalAmount: retryParams.totalAmount,
            paymentMethod: retryParams.paymentMethod,
          });

          if (cancelled || !message) return;

          addMessage(message);
          router.replace("/chat", { scroll: false });
        } catch (error) {
          console.error("[chat/payment-retry] failed to insert confirmation", error);
        }
      })();

      return () => {
        cancelled = true;
      };
    }

    const params = parseChatOrderSuccessParams(window.location.search);
    if (!params) return;

    let cancelled = false;

    void (async () => {
      try {
        const message = await ensureOrderSuccessChatMessage(getSupabase(), {
          conversationId: session.conversationId!,
          orderId: params.orderId,
          totalAmount: params.totalAmount,
        });

        if (cancelled || !message) return;

        addMessage(message);
        router.replace("/chat", { scroll: false });
      } catch (error) {
        console.error("[chat/order-success] failed to insert confirmation", error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    isLoading,
    session.conversationId,
    showWelcome,
    getSupabase,
    addMessage,
    router,
  ]);

  useEffect(() => {
    if (!session.conversationId) return;

    const channel = getSupabase()
      .channel(`messages:${session.conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${session.conversationId}`,
        },
        (payload) => {
          const message = payload.new as Message;
          console.log("[CHAT] realtime message received", {
            id: message.id,
            sender: message.sender_type,
            intent: message.intent,
          });
          addMessage(message);
        },
      )
      .subscribe();

    return () => {
      void getSupabase().removeChannel(channel);
    };
  }, [session.conversationId, getSupabase, addMessage]);

  useEffect(() => {
    initialScrollDoneRef.current = false;
    userScrolledUpRef.current = false;
  }, [session.conversationId]);

  useEffect(() => {
    if (isLoading || loadingMessages) return;

    const force = !initialScrollDoneRef.current;
    if (force) {
      initialScrollDoneRef.current = true;
    }

    requestAnimationFrame(() => {
      scrollToBottom(force);
    });
  }, [
    messages,
    isTyping,
    products,
    snapshot.itemCount,
    isLoading,
    loadingMessages,
    scrollToBottom,
  ]);

  useEffect(() => {
    if (isLoading || loadingMessages) return;

    const content = threadRef.current?.firstElementChild;
    if (!content) return;

    const observer = new ResizeObserver(() => {
      scrollToBottom();
    });

    observer.observe(content);
    return () => observer.disconnect();
  }, [isLoading, loadingMessages, session.conversationId, scrollToBottom]);

  useEffect(() => {
    if (!lastMutation || !session.conversationId || showWelcome) return;
    if (lastCartMutationAtRef.current === lastMutation.at) return;
    lastCartMutationAtRef.current = lastMutation.at;

    void (async () => {
      const payload = buildCartActionPayload(lastMutation);
      const content = formatCartActionContent(payload);
      const intent = encodeCartActionIntent(payload);

      const { data, error } = await getSupabase()
        .from("messages")
        .insert({
          conversation_id: session.conversationId,
          sender_type: "admin",
          content,
          intent,
          was_ai_drafted: false,
        })
        .select("*")
        .single();

      if (error) {
        console.error("[chat/cart-action] failed to insert message", error);
        return;
      }

      if (data) {
        addMessage(data);
      }

      await getSupabase()
        .from("conversations")
        .update({ last_message_at: new Date().toISOString() })
        .eq("id", session.conversationId!);
    })();
  }, [
    lastMutation,
    session.conversationId,
    showWelcome,
    getSupabase,
    addMessage,
  ]);

  async function handleConnect(name: string) {
    console.log("[chat/connect] handleConnect started", { name, businessId: BUSINESS_ID });
    setConnecting(true);
    setConnectError(null);

    try {
      const phone = generatePhone();
      console.log("[chat/connect] generated phone", { phone });
      const consentAt = new Date().toISOString();

      saveVaartaProfile({ name, phone });
      console.log("[chat/connect] saved vaarta profile to localStorage");

      console.log("[chat/connect] inserting customer…");
      const customerPayload = {
        business_id: BUSINESS_ID,
        phone,
        name,
        consent_given: true,
        dpdp_consent: true,
        dpdp_consent_at: consentAt,
      };

      let customerResult = await getSupabase()
        .from("customers")
        .insert(customerPayload)
        .select("id")
        .single();

      if (
        customerResult.error &&
        isMissingColumnError(customerResult.error, "dpdp_consent")
      ) {
        customerResult = await getSupabase()
          .from("customers")
          .insert({
            business_id: BUSINESS_ID,
            phone,
            name,
            consent_given: true,
          })
          .select("id")
          .single();
      }

      const { data: customer, error: customerError } = customerResult;

      if (customerError) {
        console.error("[chat/connect] customer insert failed", customerError);
        throw customerError;
      }

      saveDpdpConsent(consentAt);

      console.log("[chat/connect] customer created", { customerId: customer.id });
      saveVaartaProfile({ customerId: customer.id });

      void fetch("/api/customer/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId: customer.id }),
      }).catch((consentError) => {
        console.error("[chat/connect] consent audit failed", consentError);
      });

      console.log("[chat/connect] inserting conversation…");
      const { data: conversation, error: conversationError } = await getSupabase()
        .from("conversations")
        .insert({
          business_id: BUSINESS_ID,
          customer_id: customer.id,
        })
        .select("id")
        .single();

      if (conversationError) {
        console.error("[chat/connect] conversation insert failed", conversationError);
        throw conversationError;
      }

      console.log("[chat/connect] conversation created", {
        conversationId: conversation.id,
      });

      const nextSession: CustomerSession = {
        customerId: customer.id,
        conversationId: conversation.id,
        customerName: name,
        phone,
      };

      saveCustomerSession(nextSession);
      console.log("[chat/connect] session saved to localStorage", nextSession);

      setSession(nextSession);
      setShowWelcome(false);
      console.log("[chat/connect] welcome sheet dismissed, loading messages…");

      await loadMessages(conversation.id, name);
      console.log("[chat/connect] messages loaded, refreshing router");

      router.refresh();
      console.log("[chat/connect] complete");
    } catch (error) {
      const message = diagnoseSupabaseError(error);
      console.error("[chat/connect] handleConnect failed", { error, message });
      setConnectError(message);
    } finally {
      setConnecting(false);
      console.log("[chat/connect] handleConnect finished (connecting=false)");
    }
  }

  const addTypingPlaceholder = useCallback((conversationId: string) => {
    setMessages((prev) => {
      if (prev.some((message) => message.id === TYPING_MESSAGE_ID)) {
        return prev;
      }

      return [
        ...prev,
        {
          id: TYPING_MESSAGE_ID,
          conversation_id: conversationId,
          sender_type: "admin",
          content: "__typing__",
          intent: null,
          was_ai_drafted: false,
          created_at: new Date().toISOString(),
        },
      ];
    });
  }, []);

  const removeTypingPlaceholder = useCallback(() => {
    setMessages((prev) =>
      prev.filter((message) => message.id !== TYPING_MESSAGE_ID),
    );
  }, []);

  const processAiResponse = useCallback(
    async (
      conversationId: string,
      customerId: string,
      text: string,
      actionKey?: string | null,
    ) => {
      const requestKey = `${conversationId}:${text}`;
      if (processingRequestsRef.current.has(requestKey)) {
        console.warn("[CHAT] AI request already in flight", { requestKey });
        return;
      }

      processingRequestsRef.current.add(requestKey);
      setIsTyping(true);
      setAiError(null);
      addTypingPlaceholder(conversationId);

      console.log("[CHAT] AI request started", {
        conversationId,
        message: text,
        actionKey: actionKey ?? null,
      });

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60_000);

      try {
        const localCartItems = snapshot.items.map((item) => ({
          productId: item.productId,
          productName: item.product.name,
          quantity: item.quantity,
          unitPrice: item.product.price,
        }));

        const data = await fetchJson<{
          duplicateSkipped?: boolean;
          assistantReplySent?: boolean;
          recommendationSent?: boolean;
          route?: string;
          cart?: {
            success?: boolean;
            items?: {
              product_id: string;
              name_en: string;
              quantity: number;
              price: number;
            }[];
          };
          cartSync?: {
            product_id: string;
            name_en: string;
            quantity: number;
            price: number;
          }[] | null;
          orderPlaced?: boolean;
        }>("/api/ai/process", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversationId,
            customerId,
            message: text,
            localCartItems,
          }),
          signal: controller.signal,
          retries: 1,
        });

        console.log("[CHAT] AI response received", {
          route: data.route,
          duplicateSkipped: data.duplicateSkipped ?? false,
          assistantReplySent: data.assistantReplySent ?? false,
          recommendationSent: data.recommendationSent ?? false,
        });

        if (data.duplicateSkipped) {
          console.log("[CHAT] duplicate quick action skipped by server");
          return;
        }

        const syncResult = await syncMessages(conversationId, messagesRef.current);

        if (
          data.assistantReplySent === false &&
          syncResult.adminRepliesAdded === 0
        ) {
          console.warn("[CHAT] API completed without bot reply", {
            route: data.route,
            message: text,
          });
          setAiError(CHAT_RESPONSE_FALLBACK_MESSAGE);
        }

        const cartItems =
          data.cartSync != null
            ? data.cartSync
            : data.cart?.success && data.cart.items?.length
              ? data.cart.items
              : null;

        if (data.cartSync != null || cartItems) {
          if (data.cartSync != null) {
            clearCart();
          }
          if (cartItems && cartItems.length > 0) {
            applyCartUpdates(
              cartItems.map((item) => ({
                productId: item.product_id,
                productName: item.name_en,
                quantity: item.quantity,
                unitPrice: item.price,
              })),
            );
          }
        }

        if (data.orderPlaced) {
          clearCart();
        }
      } catch (error) {
        const isAbort = error instanceof DOMException && error.name === "AbortError";
        const isNetworkError = isNetworkFetchError(error);

        const message = isAbort
          ? "The assistant took too long to respond. Please try again."
          : isNetworkError
            ? "Could not reach the server. Check that `npm run dev` is running and refresh the page."
            : CHAT_RESPONSE_FALLBACK_MESSAGE;

        console.error("[CHAT] AI response failed:", error);
        setAiError(message);
      } finally {
        clearTimeout(timeout);
        processingRequestsRef.current.delete(requestKey);
        if (actionKey) {
          inFlightActionsRef.current.delete(actionKey);
        }
        removeTypingPlaceholder();
        setIsTyping(false);
      }
    },
    [
      addTypingPlaceholder,
      removeTypingPlaceholder,
      applyCartUpdates,
      clearCart,
      snapshot.items,
      syncMessages,
    ],
  );

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      const current = sessionRef.current;

      console.log("[CHAT] message submission", {
        text: trimmed,
        conversationId: current.conversationId ?? null,
        customerId: current.customerId ?? null,
        isTyping,
      });

      if (
        !trimmed ||
        !current.conversationId ||
        !current.customerId ||
        isTyping
      ) {
        console.warn("[CHAT] send skipped", {
          reason: !trimmed
            ? "empty"
            : !current.conversationId || !current.customerId
              ? "no_session"
              : "is_typing",
        });
        return;
      }

      const actionKey = getQuickActionKey(trimmed);
      const requestKey = `${current.conversationId}:${trimmed}`;

      if (actionKey) {
        if (inFlightActionsRef.current.has(actionKey)) {
          console.warn("[CHAT] quick action in flight", { actionKey });
          return;
        }
        if (shouldSkipDuplicateQuickAction(actionKey, messagesRef.current)) {
          console.log("[CHAT] duplicate quick action ignored", { actionKey });
          return;
        }
      }

      if (processingRequestsRef.current.has(requestKey)) {
        console.warn("[CHAT] duplicate send ignored", { requestKey });
        return;
      }

      if (actionKey) {
        inFlightActionsRef.current.add(actionKey);
      }

      try {
        const { data: inserted, error } = await getSupabase()
          .from("messages")
          .insert({
            conversation_id: current.conversationId,
            sender_type: "customer",
            content: trimmed,
          })
          .select("*")
          .single();

        if (error) {
          console.error("[CHAT] customer message insert failed:", error);
          if (actionKey) {
            inFlightActionsRef.current.delete(actionKey);
          }
          setAiError("Could not send your message. Please check your connection and try again.");
          return;
        }

        console.log("[CHAT] customer message inserted", { id: inserted.id });
        addMessage(inserted);

        const { error: conversationError } = await getSupabase()
          .from("conversations")
          .update({ last_message_at: new Date().toISOString() })
          .eq("id", current.conversationId);

        if (conversationError) {
          console.error("[ERROR] Conversation update failed:", conversationError);
        }

        void processAiResponse(
          current.conversationId,
          current.customerId,
          trimmed,
          actionKey,
        );
      } catch (error) {
        console.error("[CHAT] send message failed:", error);
        if (actionKey) {
          inFlightActionsRef.current.delete(actionKey);
        }
        setAiError(
          isNetworkFetchError(error)
            ? "Could not reach the server. Check that `npm run dev` is running and refresh the page."
            : "Could not send your message. Please try again.",
        );
      }
    },
    [getSupabase, addMessage, processAiResponse, isTyping],
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = inputText;
    setInputText("");
    void sendMessage(text);
  }

  const handleNavigate = useCallback(
    (href: string) => {
      router.push(href);
    },
    [router],
  );

  const handleQuickReply = useCallback(
    (text: string) => {
      if (showWelcome || isTyping) return;

      const undo = parseCartUndoMessage(text);
      if (undo) {
        const previousQuantity =
          snapshot.items.find((item) => item.productId === undo.productId)
            ?.quantity ?? 0;
        const nextSnapshot = applyCartUpdates([
          {
            productId: undo.productId,
            productName: undo.productName,
            quantity: undo.quantity,
            unitPrice: undo.unitPrice,
          },
        ]);
        const newQuantity =
          nextSnapshot.items.find((item) => item.productId === undo.productId)
            ?.quantity ?? previousQuantity + undo.quantity;

        recordCartMutation({
          productId: undo.productId,
          productName: undo.productName,
          action: "add",
          previousQuantity,
          newQuantity,
          unitPrice: undo.unitPrice,
          cartTotal: nextSnapshot.subtotal,
        });
        return;
      }

      const actionKey = getQuickActionKey(text);
      if (actionKey) {
        if (inFlightActionsRef.current.has(actionKey)) return;
        if (shouldSkipDuplicateQuickAction(actionKey, messagesRef.current)) return;
      }

      void sendMessage(text);
    },
    [
      showWelcome,
      isTyping,
      sendMessage,
      snapshot.items,
      applyCartUpdates,
      recordCartMutation,
    ],
  );

  const handleSamplePrompt = useCallback(
    (text: string) => {
      if (showWelcome) return;
      void sendMessage(text);
    },
    [showWelcome, sendMessage],
  );

  const hasTodayMessages = messages.some((m) => isToday(m.created_at));
  const canSend = !showWelcome && !!session.conversationId && !isTyping;
  const isSpeechActive =
    speechState === "listening" || speechState === "processing";
  const hasText = inputText.trim().length > 0;
  const inputDisabled = !canSend || isSpeechActive;

  const handleVoiceInput = useCallback(() => {
    if (!canSend) return;

    if (speechState === "listening") {
      cancelListening();
      return;
    }

    clearSpeechError();
    startListening((text) => {
      setInputText((prev) => (prev.trim() ? `${prev.trim()} ${text}` : text));
    });
  }, [
    canSend,
    speechState,
    cancelListening,
    clearSpeechError,
    startListening,
  ]);

  const handleInputChange = useCallback(
    (value: string) => {
      setInputText(value);
      if (speechError) {
        clearSpeechError();
      }
    },
    [speechError, clearSpeechError],
  );

  return (
    <div className="chat-shell flex w-full min-w-0 max-w-full flex-col overflow-x-hidden bg-[var(--whatsapp-bg)]">
      {/* Header */}
      <header className="flex h-[52px] w-full shrink-0 items-center gap-2.5 bg-[#075e54] px-3 shadow-md md:px-4 lg:px-6 safe-top">
        <Link
          href="/"
          className="rounded-full p-1.5 text-white/90 transition-colors hover:bg-white/10"
          aria-label="Back"
        >
          <ArrowLeft className="size-5" />
        </Link>

        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#128c7e] text-[11px] font-bold text-white">
          {STORE_INITIALS}
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-medium leading-tight text-white">
            {STORE_NAME}
          </p>
          <p className="text-[12px] leading-tight text-white/70">Online</p>
        </div>

        <div className="flex items-center gap-1">
          <Link
            href="/my-data"
            className="hidden min-[400px]:inline-flex rounded-full px-2 py-1 text-[11px] font-medium text-white/80 transition-colors hover:bg-white/10"
          >
            My Data
          </Link>
          <button
            type="button"
            className="rounded-full p-2 text-white/90 transition-colors hover:bg-white/10"
            aria-label="More options"
          >
            <MoreVertical className="size-5" />
          </button>
        </div>
      </header>

      {/* Message thread + input */}
      <div className="flex min-h-0 flex-1 flex-col">
        <div
          ref={threadRef}
          onScroll={handleThreadScroll}
          className="chat-thread whatsapp-pattern flex-1 overflow-y-auto px-2 py-2 md:px-4 lg:px-6"
        >
          {isLoading ? (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-gray-500">Loading…</p>
            </div>
          ) : loadingMessages ? (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-gray-500">Loading messages…</p>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {hasTodayMessages && (
                <div className="my-1 flex justify-center">
                  <span className="rounded-md bg-white/70 px-2 py-0.5 text-[11px] text-gray-600 shadow-sm">
                    Today
                  </span>
                </div>
              )}

              {messages.map((message) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  onQuickReply={handleQuickReply}
                  onNavigate={handleNavigate}
                  onSamplePrompt={handleSamplePrompt}
                  disabled={showWelcome || isTyping}
                  productNames={productNames}
                />
              ))}

              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {aiError ? (
          <div
            role="alert"
            className="mx-2 mb-1 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 md:mx-4 lg:mx-6"
          >
            {aiError}
          </div>
        ) : null}

        {speechError ? (
          <div
            role="alert"
            className="mx-2 mb-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 md:mx-4 lg:mx-6"
          >
            {speechError}
          </div>
        ) : null}

        {!showWelcome && snapshot.itemCount > 0 ? (
          <div className="shrink-0 border-t border-[#128c7e]/15 bg-[#ecfdf5]/90 px-2 py-2 md:px-4 lg:px-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[12px] font-medium text-[#065f46]">
                Cart Total: {formatCurrency(snapshot.subtotal)}
              </p>
              <CartQuickActions
                onNavigate={handleNavigate}
                disabled={showWelcome || isTyping}
              />
            </div>
          </div>
        ) : null}

        {/* Input bar */}
        <form
          onSubmit={handleSubmit}
          className="flex w-full min-w-0 shrink-0 items-end gap-1.5 border-t border-black/5 bg-[#f0f0f0] px-2 py-1.5 md:px-4 lg:px-6 safe-bottom"
        >
          <button
            type="button"
            className="mb-0.5 p-1.5 text-gray-500"
            aria-label="Attach file"
            tabIndex={-1}
          >
            <Paperclip className="size-5" />
          </button>

          <input
            type="text"
            value={inputText}
            onChange={(e) => handleInputChange(e.target.value)}
            placeholder={
              speechState === "listening"
                ? "Listening..."
                : speechState === "processing"
                  ? "Converting speech..."
                  : "Message"
            }
            disabled={inputDisabled}
            className="mb-0.5 min-w-0 flex-1 rounded-full border-none bg-white px-3.5 py-2 text-[15px] leading-tight shadow-sm focus:outline-none focus:ring-1 focus:ring-[#128c7e]/40 disabled:opacity-50"
            autoComplete="off"
          />

          {hasText ? (
            <button
              type="submit"
              disabled={!canSend}
              className="mb-0.5 rounded-full bg-[#128c7e] p-2 text-white transition-colors hover:bg-[#075e54] disabled:opacity-50"
              aria-label="Send message"
            >
              <Send className="size-5" />
            </button>
          ) : speechState === "listening" ? (
            <button
              type="button"
              onClick={handleVoiceInput}
              className="mb-0.5 max-w-[9rem] truncate px-1.5 py-1.5 text-[12px] font-medium text-red-600"
              aria-label="Stop listening"
            >
              🔴 Listening...
            </button>
          ) : speechState === "processing" ? (
            <span
              className="mb-0.5 max-w-[9rem] truncate px-1.5 py-1.5 text-[12px] font-medium text-gray-600"
              aria-live="polite"
            >
              ⏳ Converting speech...
            </span>
          ) : speechSupported ? (
            <button
              type="button"
              onClick={handleVoiceInput}
              disabled={!canSend}
              className="mb-0.5 p-1.5 text-gray-500 transition-colors hover:text-[#128c7e] disabled:opacity-50"
              aria-label="Voice input"
            >
              <Mic className="size-5" />
            </button>
          ) : null}
        </form>
      </div>

      <CustomerOnboardingSheet
        open={!isLoading && showWelcome}
        onConnect={handleConnect}
        loading={connecting}
        error={connectError}
      />
    </div>
  );
}
