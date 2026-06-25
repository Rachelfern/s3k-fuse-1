"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ArrowLeft,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  CreditCard,
  ShoppingCart,
  Truck,
} from "lucide-react";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { ChatTypingIndicator } from "@/components/chat/chat-typing-indicator";
import { ConnectionErrorBanner } from "@/components/ui/connection-error-banner";
import { Skeleton } from "@/components/ui/skeleton";
import { Toast } from "@/components/ui/toast";
import { useAiStatus } from "@/hooks/use-ai-status";
import {
  NEXT_BEST_ACTION_LABELS,
  type DraftSuggestion,
  type NextBestActionKey,
} from "@/lib/ai/admin-chat-ai";
import {
  formatIssueTypeLabel,
  priorityBadgeLabel,
} from "@/lib/ai/issue-classifier";
import { formatTime } from "@/lib/format";
import type { ConversationListItem } from "@/lib/admin/conversations-list";
import { createClient } from "@/lib/supabase/client";
import type { AiIssueType, AiPriorityLevel, Message } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ActiveConversation {
  id: string;
  customer_id: string;
  customer_name: string | null;
  customer_phone: string;
  dpdp_consent: boolean;
  dpdp_consent_at: string | null;
  deletion_status: string | null;
}

function ConsentStatusBadge({ consented }: { consented: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        consented
          ? "bg-green-100 text-green-700"
          : "bg-amber-100 text-amber-700",
      )}
    >
      {consented ? "Accepted" : "Not Accepted"}
    </span>
  );
}

function PriorityBadge({ level }: { level: AiPriorityLevel }) {
  const emoji =
    level === "critical" ? "🔴" : level === "high" ? "🟠" : "🟢";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
        level === "critical" && "bg-red-100 text-red-700",
        level === "high" && "bg-orange-100 text-orange-700",
        level === "normal" && "bg-green-100 text-green-700",
      )}
    >
      {emoji} {priorityBadgeLabel(level)}
    </span>
  );
}

function IssueTypeBadge({ issueType }: { issueType: AiIssueType }) {
  if (issueType === "NORMAL") return null;

  return (
    <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">
      {formatIssueTypeLabel(issueType)}
    </span>
  );
}

function getCustomerInitials(name: string | null, phone: string): string {
  if (name?.trim()) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }

  const digits = phone.replace(/\D/g, "");
  return digits.slice(-2) || "??";
}

function getCustomerLabel(name: string | null, phone: string): string {
  const trimmedName = name?.trim();
  if (trimmedName) return trimmedName;
  if (phone.startsWith("deleted_")) return phone;
  return phone;
}

function formatConversationTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);

  if (diffMins < 1) return "now";
  if (diffMins < 60) return `${diffMins}m`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h`;

  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
  }).format(date);
}

async function fetchConversationsFromApi(): Promise<ConversationListItem[]> {
  const response = await fetch("/api/admin/conversations", { cache: "no-store" });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(body?.error ?? `Request failed (${response.status})`);
  }

  const data = (await response.json()) as {
    conversations: ConversationListItem[];
  };
  if (process.env.NODE_ENV === "development") {
    console.log("[ADMIN CHATS]", { rows: data.conversations.length });
  }
  return data.conversations;
}

async function resolveConversationForCustomer(
  customerId: string,
): Promise<ActiveConversation | null> {
  const response = await fetch(
    `/api/admin/conversations/by-customer/${customerId}`,
    { cache: "no-store" },
  );

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(body?.error ?? `Request failed (${response.status})`);
  }

  const data = (await response.json()) as {
    conversation: ActiveConversation | null;
  };
  return data.conversation;
}

async function fetchMessagesFromApi(conversationId: string): Promise<Message[]> {
  const response = await fetch(
    `/api/admin/conversations/${conversationId}/messages`,
    { cache: "no-store" },
  );

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(body?.error ?? `Request failed (${response.status})`);
  }

  const data = (await response.json()) as { messages: Message[] };
  return data.messages;
}

async function markConversationRead(conversationId: string): Promise<void> {
  const response = await fetch(
    `/api/admin/conversations/${conversationId}/messages`,
    { method: "PATCH" },
  );

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(body?.error ?? `Request failed (${response.status})`);
  }
}

function mapNextBestActionLabel(label: string): NextBestActionKey {
  const normalized = label.toLowerCase();

  if (normalized.includes("shipment")) return "monitor_shipment";
  if (normalized.includes("payment") || normalized.includes("utr")) {
    return "confirm_payment";
  }
  if (normalized.includes("cart") || normalized.includes("invoice")) {
    return "follow_up_cart";
  }
  if (normalized.includes("confirm")) return "send_confirmation";
  return "follow_up_cart";
}

function AdminMessageBubble({ message }: { message: Message }) {
  const time = formatTime(message.created_at);

  if (message.sender_type === "system") {
    return (
      <div className="flex justify-center">
        <div className="rounded-full bg-gray-100 px-3 py-1 text-center text-xs text-gray-500">
          {message.content}
        </div>
      </div>
    );
  }

  if (message.sender_type === "customer") {
    return (
      <div className="ml-auto flex w-full max-w-[85%] min-w-0 flex-col items-end sm:max-w-[75%]">
        <div className="w-full overflow-hidden rounded-[18px_18px_4px_18px] bg-[#DCF8C6] px-3 py-2 text-gray-900">
          <p className="chat-bubble-content whitespace-pre-wrap text-sm leading-relaxed">
            {message.content}
          </p>
          <div className="mt-0.5 flex items-center justify-end">
            <span className="text-[10px] text-gray-400">{time}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[85%] min-w-0 sm:max-w-[75%]">
      {message.was_ai_drafted ? (
        <span className="mb-1 inline-flex rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700">
          🤖 AI Reply
        </span>
      ) : null}
      <div className="overflow-hidden rounded-[18px_18px_18px_4px] bg-white px-3 py-2 text-gray-900 shadow-sm">
        <p className="chat-bubble-content whitespace-pre-wrap text-sm leading-relaxed">
          {message.content}
        </p>
        <div className="mt-0.5 flex justify-end">
          <span className="text-[10px] text-gray-400">{time}</span>
        </div>
      </div>
    </div>
  );
}

function NextBestActionIcon({ action }: { action: NextBestActionKey }) {
  const icon = NEXT_BEST_ACTION_LABELS[action].icon;
  const className = "size-4 shrink-0 text-gray-600";

  switch (icon) {
    case "truck":
      return <Truck className={className} />;
    case "credit-card":
      return <CreditCard className={className} />;
    case "check-circle":
      return <CheckCircle className={className} />;
    case "shopping-cart":
      return <ShoppingCart className={className} />;
  }
}

interface AdminChatsViewProps {
  customerId?: string;
}

export function AdminChatsView({ customerId }: AdminChatsViewProps) {
  const { status: aiStatus } = useAiStatus();
  const aiOffline = aiStatus === "offline";
  const [conversations, setConversations] = useState<ConversationListItem[]>(
    [],
  );
  const [listLoading, setListLoading] = useState(true);
  const [activeConversation, setActiveConversation] =
    useState<ActiveConversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [composeText, setComposeText] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [sending, setSending] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(true);
  const [summary, setSummary] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [draftSuggestions, setDraftSuggestions] = useState<DraftSuggestion[]>(
    [],
  );
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [nextBestAction, setNextBestAction] =
    useState<NextBestActionKey>("follow_up_cart");
  const [nextBestActionLabel, setNextBestActionLabel] = useState(
    NEXT_BEST_ACTION_LABELS.follow_up_cart.label,
  );
  const [issueType, setIssueType] = useState<AiIssueType>("NORMAL");
  const [priorityLevel, setPriorityLevel] = useState<AiPriorityLevel>("normal");
  const [customerIntent, setCustomerIntent] = useState<string | null>(null);
  const [suggestedReply, setSuggestedReply] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState(false);
  const [aiToastVisible, setAiToastVisible] = useState(false);
  const [deletionActionLoading, setDeletionActionLoading] = useState(false);

  const messageIdsRef = useRef<Set<string>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pendingAiDraftRef = useRef(false);
  const aiRefreshRef = useRef(0);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const addMessage = useCallback((message: Message) => {
    if (messageIdsRef.current.has(message.id)) return;
    messageIdsRef.current.add(message.id);
    setMessages((prev) =>
      [...prev, message].sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      ),
    );
  }, []);

  const loadConversationList = useCallback(async () => {
    try {
      const rows = await fetchConversationsFromApi();
      setConversations(rows);
      setError(null);
      setConnectionError(false);
    } catch (loadError) {
      const message =
        loadError instanceof Error
          ? loadError.message
          : "Failed to load conversations.";
      if (process.env.NODE_ENV === "development") {
        console.error("[ADMIN CHATS] load failed:", loadError);
      }
      setConnectionError(true);
      setError(message);
    } finally {
      setListLoading(false);
    }
  }, []);

  const loadAiInsights = useCallback(
    async (conversationId: string, customerIdForAction: string) => {
      const refreshId = ++aiRefreshRef.current;
      setSummaryLoading(true);
      setSuggestionsLoading(true);
      setSummary(null);
      setDraftSuggestions([]);
      setCustomerIntent(null);
      setSuggestedReply(null);

      try {
        const summaryResponse = await fetch("/api/ai/summary", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversationId, forceRefresh: true }),
        });

        if (refreshId !== aiRefreshRef.current) return;

        if (summaryResponse.ok) {
          const summaryData = (await summaryResponse.json()) as {
            summary?: string;
            nextBestAction?: string;
            suggestedDrafts?: DraftSuggestion[];
            issueType?: AiIssueType;
            priorityLevel?: AiPriorityLevel;
            customerIntent?: string;
            suggestedReply?: string;
            suggestedAction?: string;
          };
          setSummary(summaryData.summary ?? null);
          setDraftSuggestions(summaryData.suggestedDrafts ?? []);
          setIssueType(summaryData.issueType ?? "NORMAL");
          setPriorityLevel(summaryData.priorityLevel ?? "normal");
          setCustomerIntent(summaryData.customerIntent ?? null);
          setSuggestedReply(summaryData.suggestedReply ?? null);

          const actionLabel =
            summaryData.suggestedAction ??
            summaryData.nextBestAction ??
            NEXT_BEST_ACTION_LABELS.follow_up_cart.label;

          if (actionLabel) {
            setNextBestActionLabel(actionLabel);
            setNextBestAction(mapNextBestActionLabel(actionLabel));
          }
        }
      } catch (loadError) {
        if (refreshId !== aiRefreshRef.current) return;
        console.error("[ERROR] AI insights failed:", loadError);
      } finally {
        if (refreshId === aiRefreshRef.current) {
          setSummaryLoading(false);
          setSuggestionsLoading(false);
        }
      }
    },
    [],
  );

  const openConversation = useCallback(
    async (targetCustomerId: string) => {
      setMessagesLoading(true);
      setComposeText("");
      pendingAiDraftRef.current = false;

      try {
        const conversation = await resolveConversationForCustomer(
          targetCustomerId,
        );

        if (!conversation) {
          setActiveConversation(null);
          setMessages([]);
          setError("Conversation not found for this customer.");
          return;
        }

        setActiveConversation(conversation);

        await markConversationRead(conversation.id);

        const rows = await fetchMessagesFromApi(conversation.id);
        messageIdsRef.current.clear();
        rows.forEach((row) => messageIdsRef.current.add(row.id));
        setMessages(rows);
        setError(null);

        void loadAiInsights(conversation.id, conversation.customer_id);
        void loadConversationList();
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Failed to open conversation.",
        );
      } finally {
        setMessagesLoading(false);
      }
    },
    [loadAiInsights, loadConversationList],
  );

  useEffect(() => {
    if (aiOffline) {
      setAiToastVisible(true);
    }
  }, [aiOffline]);

  useEffect(() => {
    void loadConversationList();
  }, [loadConversationList]);

  useEffect(() => {
    if (!customerId) {
      setActiveConversation(null);
      setMessages([]);
      return;
    }

    void openConversation(customerId);
  }, [customerId, openConversation]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    const supabase = createClient();

    const conversationsChannel = supabase
      .channel("admin-chats-conversations")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversations" },
        () => {
          void loadConversationList();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(conversationsChannel);
    };
  }, [loadConversationList]);

  useEffect(() => {
    if (!activeConversation?.id) return;

    const supabase = createClient();
    const conversationId = activeConversation.id;
    const customerIdForAction = activeConversation.customer_id;

    const handler = (
      payload: RealtimePostgresChangesPayload<{ [key: string]: unknown }>,
    ) => {
      if (payload.eventType !== "INSERT") return;

      const message = payload.new as Message;
      addMessage(message);

      if (message.sender_type === "customer") {
        void loadAiInsights(conversationId, customerIdForAction);
        void loadConversationList();
      }
    };

    const messagesChannel = supabase
      .channel(`admin-messages:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        handler,
      )
      .subscribe();

    const draftChannel = supabase
      .channel(`admin-ai:${conversationId}`)
      .on("broadcast", { event: "pending_draft" }, (payload) => {
        const draft = payload.payload as { draft?: string };
        if (draft.draft) {
          setComposeText(draft.draft);
          pendingAiDraftRef.current = true;
        }
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(messagesChannel);
      void supabase.removeChannel(draftChannel);
    };
  }, [
    activeConversation?.id,
    activeConversation?.customer_id,
    addMessage,
    loadAiInsights,
    loadConversationList,
  ]);

  async function handleDraftWithAi() {
    if (!activeConversation || drafting || aiOffline) return;

    setDrafting(true);
    const minDelay = new Promise<void>((resolve) => {
      setTimeout(resolve, 3000 + Math.random() * 2000);
    });

    try {
      const latestCustomerMessage = [...messages]
        .reverse()
        .find((message) => message.sender_type === "customer");

      const [response] = await Promise.all([
        fetch("/api/ai/draft", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversationId: activeConversation.id,
            customerId: activeConversation.customer_id,
            customerMessage: latestCustomerMessage?.content ?? "",
          }),
        }),
        minDelay,
      ]);

      if (!response.ok) throw new Error("Draft request failed");

      const data = (await response.json()) as { draft?: string };
      setComposeText(data.draft ?? "");
      pendingAiDraftRef.current = true;
    } catch (draftError) {
      console.error("[ERROR] Draft with AI failed:", draftError);
      setError("Failed to generate AI draft.");
    } finally {
      setDrafting(false);
    }
  }

  async function handleSend() {
    const trimmed = composeText.trim();
    if (!trimmed || !activeConversation || sending) return;

    setSending(true);

    try {
      const wasAiDrafted = pendingAiDraftRef.current;

      const response = await fetch(
        `/api/admin/conversations/${activeConversation.id}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: trimmed,
            was_ai_drafted: wasAiDrafted,
          }),
        },
      );

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? "Failed to send message");
      }

      const data = (await response.json()) as { message: Message };
      addMessage(data.message);
      setComposeText("");
      pendingAiDraftRef.current = false;

      void loadConversationList();
    } catch (sendError) {
      console.error("[ERROR] Send failed:", sendError);
      setError("Failed to send message.");
    } finally {
      setSending(false);
    }
  }

  function handleInsertDraft(text: string) {
    setComposeText(text);
    pendingAiDraftRef.current = true;
  }

  const handleDeletionDecision = useCallback(
    async (action: "approve_deletion" | "reject_deletion") => {
      if (!activeConversation) return;

      setDeletionActionLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/admin/customers/${activeConversation.customer_id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action }),
          },
        );

        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(body?.error ?? "Failed to update deletion request");
        }

        const _result = (await response.json()) as {
          deletedAt?: string;
        };
        void _result;

        setActiveConversation((prev) =>
          prev
            ? {
                ...prev,
                deletion_status:
                  action === "approve_deletion" ? "deleted" : null,
                ...(action === "approve_deletion"
                  ? {
                      customer_name: null,
                      dpdp_consent: false,
                      dpdp_consent_at: null,
                    }
                  : {}),
              }
            : prev,
        );

        if (action === "approve_deletion") {
          setMessages([]);
          messageIdsRef.current.clear();
          setSummary(null);
          setDraftSuggestions([]);
        }

        setError(null);
        void loadConversationList();
      } catch (decisionError) {
        setError(
          decisionError instanceof Error
            ? decisionError.message
            : "Failed to process deletion request.",
        );
      } finally {
        setDeletionActionLoading(false);
      }
    },
    [activeConversation, loadConversationList],
  );

  const actionMeta = {
    ...NEXT_BEST_ACTION_LABELS[nextBestAction],
    label: nextBestActionLabel,
  };

  return (
    <div
      className="flex flex-col overflow-hidden bg-gray-50"
      style={{ height: "calc(100vh - 56px)" }}
    >
      {connectionError ? (
        <div className="shrink-0 px-4 pt-3">
          <ConnectionErrorBanner
            message={`Failed to load conversations: ${error ?? "Unknown error"}`}
            onRetry={() => void loadConversationList()}
          />
        </div>
      ) : null}

      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
      {/* Column 1 — Conversation list */}
      <aside
        className={cn(
          "flex shrink-0 flex-col border-r border-gray-200 bg-white",
          "w-full md:w-72",
          customerId ? "hidden md:flex" : "flex",
        )}
      >
        <p className="px-4 pb-2 pt-4 text-xs font-semibold uppercase text-gray-400">
          Conversations
        </p>
        <div className="flex-1 overflow-y-auto">
          {listLoading ? (
            <div className="space-y-3 px-4 py-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="flex gap-3">
                  <Skeleton className="size-10 shrink-0 rounded-full bg-gray-200" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3 w-2/3 bg-gray-200" />
                    <Skeleton className="h-3 w-full bg-gray-200" />
                  </div>
                </div>
              ))}
            </div>
          ) : conversations.length === 0 ? (
            <p className="px-4 py-6 text-sm text-gray-500">
              No conversations yet.
            </p>
          ) : (
            conversations.map((conversation) => {
              const isActive = customerId === conversation.customer_id;
              const label = getCustomerLabel(
                conversation.customer_name,
                conversation.customer_phone,
              );

              return (
                <Link
                  key={conversation.id}
                  href={`/admin/chats/${conversation.customer_id}`}
                  className={cn(
                    "flex cursor-pointer gap-3 px-4 py-3 transition-colors hover:bg-gray-50",
                    isActive && "border-l-2 border-green-500 bg-green-50",
                  )}
                >
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-green-100 text-sm font-semibold text-green-700">
                    {getCustomerInitials(
                      conversation.customer_name,
                      conversation.customer_phone,
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="truncate text-sm font-medium text-gray-900">
                        {label}
                      </p>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <span className="text-xs text-gray-400">
                          {formatConversationTime(conversation.last_message_at)}
                        </span>
                        {conversation.unread_count > 0 ? (
                          <span className="rounded-full bg-green-500 px-1.5 text-[10px] font-medium text-white">
                            {conversation.unread_count}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <p className="truncate text-xs text-gray-400">
                      {conversation.ai_summary ??
                        conversation.last_message_preview ??
                        "No messages yet"}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <PriorityBadge level={conversation.ai_priority_level} />
                      <IssueTypeBadge issueType={conversation.ai_issue_type} />
                      <ConsentStatusBadge consented={conversation.dpdp_consent} />
                    </div>
                  </div>
                </Link>
              );
            })
          )}
        </div>
      </aside>

      {/* Column 2 — Chat thread */}
      <section
        className={cn(
          "flex min-w-0 flex-1 flex-col",
          !customerId && "hidden md:flex",
        )}
      >
        {activeConversation ? (
          <>
            <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-gray-200 bg-white px-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  {customerId ? (
                    <Link
                      href="/admin/chats"
                      className="inline-flex shrink-0 items-center rounded-lg p-1.5 text-gray-600 transition-colors hover:bg-gray-100 md:hidden"
                      aria-label="Back to conversations"
                    >
                      <ArrowLeft className="size-5" />
                    </Link>
                  ) : null}
                  <p className="truncate text-base font-semibold text-gray-900">
                    {getCustomerLabel(
                      activeConversation.customer_name,
                      activeConversation.customer_phone,
                    )}
                  </p>
                  <ConsentStatusBadge
                    consented={activeConversation.dpdp_consent}
                  />
                </div>
                <p className="text-sm text-gray-400">
                  {activeConversation.customer_phone}
                </p>
              </div>
            </div>

            <div className="whatsapp-pattern flex-1 overflow-y-auto px-4 py-3">
              {messagesLoading ? (
                <div className="flex flex-col gap-2 pt-2">
                  <ChatTypingIndicator />
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {messages.length === 0 ? (
                    <div className="flex justify-center py-8">
                      <span className="rounded-full bg-white/70 px-3 py-1 text-xs text-gray-500">
                        No messages in this conversation
                      </span>
                    </div>
                  ) : (
                    messages.map((message) => (
                      <AdminMessageBubble key={message.id} message={message} />
                    ))
                  )}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            <div className="shrink-0 border-t border-gray-200 bg-white p-3">
              {aiOffline ? (
                <p className="mb-2 text-xs font-medium text-amber-700">
                  Type manually — AI features offline
                </p>
              ) : null}
              <div className="relative">
                {drafting ? (
                  <div className="absolute inset-0 z-10 flex flex-col justify-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                    <Skeleton className="h-3 w-full animate-pulse bg-gray-200" />
                    <Skeleton className="h-3 w-4/5 animate-pulse bg-gray-200" />
                    <Skeleton className="h-3 w-3/5 animate-pulse bg-gray-200" />
                  </div>
                ) : null}
                <textarea
                  value={composeText}
                  onChange={(event) => {
                    setComposeText(event.target.value);
                    pendingAiDraftRef.current = false;
                  }}
                  placeholder={
                    aiOffline ? "Type your reply manually…" : "Type a reply..."
                  }
                  disabled={drafting || sending}
                  className="h-20 w-full resize-none rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm placeholder:text-gray-400 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 disabled:opacity-60"
                />
              </div>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                {!aiOffline ? (
                  <button
                    type="button"
                    onClick={() => void handleDraftWithAi()}
                    disabled={drafting || sending}
                    className="w-full rounded-lg border border-green-500 px-3 py-1.5 text-sm font-medium text-green-600 transition-colors hover:bg-green-50 disabled:opacity-50 sm:w-auto"
                  >
                    ✨ Draft with AI
                  </button>
                ) : (
                  <span className="text-xs text-gray-400">Manual mode</span>
                )}
                <button
                  type="button"
                  onClick={() => void handleSend()}
                  disabled={!composeText.trim() || drafting || sending}
                  className="w-full rounded-lg bg-green-500 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-green-600 disabled:opacity-50 sm:w-auto"
                >
                  Send →
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-gray-500">
            <p className="text-sm font-medium text-gray-700">
              Select a conversation
            </p>
            <p className="text-xs text-gray-400">
              Choose a customer from the list to view messages
            </p>
          </div>
        )}
      </section>

      {/* Column 3 — AI Sidebar */}
      <aside className="hidden w-72 shrink-0 flex-col border-l border-gray-200 bg-white xl:flex">
        <div className="border-b border-gray-200 px-4 py-3">
          <p className="text-xs font-semibold uppercase text-gray-400">
            AI Operations
          </p>
        </div>
        <div className="flex-1 overflow-y-auto">
          {activeConversation ? (
            <div className="space-y-6 p-4">
              <section>
                <p className="text-xs font-semibold uppercase text-gray-400">
                  Consent Status
                </p>
                <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-gray-700">DPDP Consent</span>
                    <ConsentStatusBadge
                      consented={activeConversation.dpdp_consent}
                    />
                  </div>
                  {activeConversation.dpdp_consent_at ? (
                    <p className="mt-1 text-xs text-gray-500">
                      Accepted{" "}
                      {new Intl.DateTimeFormat("en-IN", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }).format(new Date(activeConversation.dpdp_consent_at))}
                    </p>
                  ) : null}
                </div>
              </section>

              {activeConversation.deletion_status === "pending_deletion" ? (
                <section>
                  <p className="text-xs font-semibold uppercase text-red-500">
                    Deletion Request
                  </p>
                  <div className="mt-2 space-y-2 rounded-lg border border-red-200 bg-red-50 p-3">
                    <p className="text-sm text-red-800">
                      Customer requested data deletion.
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={deletionActionLoading}
                        onClick={() => void handleDeletionDecision("approve_deletion")}
                        className="flex-1 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        disabled={deletionActionLoading}
                        onClick={() => void handleDeletionDecision("reject_deletion")}
                        className="flex-1 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                </section>
              ) : null}

              {activeConversation.deletion_status === "deleted" ? (
                <section>
                  <p className="text-xs font-semibold uppercase text-[#128c7e]">
                    Deletion Completed
                  </p>
                  <div className="mt-2 rounded-lg border border-[#128c7e]/20 bg-[#ecfdf5] p-3">
                    <p className="text-sm text-[#075e54]">
                      Personal data has been removed. Chat history cleared and
                      order records anonymised.
                    </p>
                  </div>
                </section>
              ) : null}

              <section>
                <p className="text-xs font-semibold uppercase text-gray-400">
                  Issue Type
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <IssueTypeBadge issueType={issueType} />
                  {issueType === "NORMAL" ? (
                    <span className="text-sm text-gray-600">Normal</span>
                  ) : null}
                </div>
              </section>

              <section>
                <p className="text-xs font-semibold uppercase text-gray-400">
                  Priority
                </p>
                <div className="mt-2">
                  <PriorityBadge level={priorityLevel} />
                </div>
              </section>

              {customerIntent ? (
                <section>
                  <p className="text-xs font-semibold uppercase text-gray-400">
                    Customer Intent
                  </p>
                  <p className="mt-2 text-sm text-gray-700">{customerIntent}</p>
                </section>
              ) : null}

              {/* Section A — Summary */}
              <section>
                <button
                  type="button"
                  onClick={() => setSummaryOpen((open) => !open)}
                  className="flex w-full items-center gap-1 text-left"
                >
                  {summaryOpen ? (
                    <ChevronDown className="size-3.5 text-gray-400" />
                  ) : (
                    <ChevronRight className="size-3.5 text-gray-400" />
                  )}
                  <span className="text-xs font-semibold uppercase text-gray-400">
                    Summary
                  </span>
                </button>
                {summaryOpen ? (
                  <div className="mt-2">
                    {summaryLoading ? (
                      <div className="space-y-2">
                        <Skeleton className="h-3 w-full" />
                        <Skeleton className="h-3 w-full" />
                        <Skeleton className="h-3 w-2/3" />
                      </div>
                    ) : (
                      <p className="text-sm leading-relaxed text-gray-700">
                        {summary ?? "Summary unavailable."}
                      </p>
                    )}
                  </div>
                ) : null}
              </section>

              {/* Section B — Recommended action */}
              <section>
                <p className="text-xs font-semibold uppercase text-gray-400">
                  Recommended Action
                </p>
                <div className="mt-2 flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <NextBestActionIcon action={nextBestAction} />
                  <span className="text-sm font-medium text-gray-800">
                    {actionMeta.label}
                  </span>
                </div>
              </section>

              {/* Section C — Draft response */}
              <section>
                <p className="text-xs font-semibold uppercase text-gray-400">
                  Draft Response
                </p>
                <div className="mt-2 space-y-3">
                  {summaryLoading ? (
                    <Skeleton className="h-20 w-full rounded-lg" />
                  ) : suggestedReply ? (
                    <div className="rounded-lg border border-green-200 bg-green-50 p-3">
                      <p className="text-sm leading-relaxed text-gray-800">
                        {suggestedReply}
                      </p>
                      <button
                        type="button"
                        onClick={() => handleInsertDraft(suggestedReply)}
                        className="mt-3 w-full rounded-lg bg-green-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-green-700"
                      >
                        Use Suggested Reply
                      </button>
                    </div>
                  ) : (
                    <p className="text-xs text-gray-500">
                      No suggested reply yet.
                    </p>
                  )}

                  {suggestionsLoading ? (
                    <>
                      <Skeleton className="h-16 w-full rounded-lg" />
                      <Skeleton className="h-16 w-full rounded-lg" />
                    </>
                  ) : draftSuggestions.length > 0 ? (
                    draftSuggestions.map((draft) => (
                      <div
                        key={draft.label}
                        className="rounded-lg border border-gray-200 bg-gray-50 p-3"
                      >
                        <p className="text-xs text-gray-400">{draft.label}</p>
                        <p className="mt-1 line-clamp-3 text-xs text-gray-700">
                          {draft.text}
                        </p>
                        <button
                          type="button"
                          onClick={() => handleInsertDraft(draft.text)}
                          className="mt-2 rounded bg-green-500 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-green-600"
                        >
                          Use This Draft
                        </button>
                      </div>
                    ))
                  ) : null}
                </div>
              </section>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center p-4">
              <p className="text-center text-xs text-gray-400">
                AI insights appear when a conversation is selected
              </p>
            </div>
          )}
        </div>
      </aside>
      </div>

      <Toast
        message="AI features offline — manual mode active"
        visible={aiToastVisible && aiOffline}
        variant="warning"
        onDismiss={() => setAiToastVisible(false)}
      />

      {error && !connectionError ? (
        <div className="pointer-events-none fixed bottom-4 right-4 z-50 max-w-sm rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-lg">
          {error}
          <button
            type="button"
            className="pointer-events-auto ml-2 text-xs underline"
            onClick={() => setError(null)}
          >
            Dismiss
          </button>
        </div>
      ) : null}
    </div>
  );
}
