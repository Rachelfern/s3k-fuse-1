import type { Message } from "@/lib/types";

const CACHE_PREFIX = "vaarta_chat_state_";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface ChatStateCache {
  conversationId: string;
  messages: Message[];
  latestMessageId: string | null;
  scrollTop: number;
  savedAt: number;
}

let memoryCache: ChatStateCache | null = null;

function cacheKey(conversationId: string) {
  return `${CACHE_PREFIX}${conversationId}`;
}

export function getChatStateCache(conversationId: string): ChatStateCache | null {
  if (memoryCache?.conversationId === conversationId) {
    return memoryCache;
  }

  if (typeof window === "undefined") return null;

  try {
    const raw = sessionStorage.getItem(cacheKey(conversationId));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as ChatStateCache;
    if (
      parsed.conversationId !== conversationId ||
      !Array.isArray(parsed.messages) ||
      Date.now() - parsed.savedAt > MAX_AGE_MS
    ) {
      sessionStorage.removeItem(cacheKey(conversationId));
      return null;
    }

    memoryCache = parsed;
    return parsed;
  } catch {
    sessionStorage.removeItem(cacheKey(conversationId));
    return null;
  }
}

export function hasChatStateCache(conversationId: string): boolean {
  return getChatStateCache(conversationId) !== null;
}

export function saveChatStateCache(state: ChatStateCache) {
  memoryCache = state;

  if (typeof window === "undefined") return;

  try {
    sessionStorage.setItem(cacheKey(state.conversationId), JSON.stringify(state));
  } catch (error) {
    console.warn("[chat/cache] failed to persist chat state", error);
  }
}

export function clearChatStateCache(conversationId?: string) {
  if (conversationId) {
    memoryCache =
      memoryCache?.conversationId === conversationId ? null : memoryCache;
    if (typeof window !== "undefined") {
      sessionStorage.removeItem(cacheKey(conversationId));
    }
    return;
  }

  memoryCache = null;

  if (typeof window === "undefined") return;

  for (let i = sessionStorage.length - 1; i >= 0; i--) {
    const key = sessionStorage.key(i);
    if (key?.startsWith(CACHE_PREFIX)) {
      sessionStorage.removeItem(key);
    }
  }
}
