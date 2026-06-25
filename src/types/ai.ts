/** Phase 5 commerce agent — supported intents only */
export type CommerceIntent = "add_to_cart" | "view_cart" | "recommendation";

export interface AgentCartUpdate {
  product_name: string;
  quantity: number;
}

/** Raw JSON shape returned by Ollama */
export interface OllamaAgentPayload {
  intent: CommerceIntent;
  reply: string;
  cart_updates?: AgentCartUpdate[];
  recommended_product_ids?: string[];
}

export interface ResolvedCartUpdate {
  productId: string;
  productName: string;
  quantity: number;
  /** Authoritative unit price from the database — never from LLM output */
  unitPrice?: number;
  /** Product photo from catalog — preserved across cart sync */
  imageUrl?: string | null;
}

/** Normalized response from /api/chat */
export interface ChatAgentResult {
  source: "ollama" | "fallback";
  reply: {
    role: "assistant";
    content: string;
    productIds?: string[];
  };
  cartUpdates?: ResolvedCartUpdate[];
}

export interface ChatApiRequest {
  message: string;
  cartSnapshot: import("@/types/cart").CartSnapshot;
  recentMessages: import("@/types/chat").ChatMessage[];
}

export const COMMERCE_INTENTS: CommerceIntent[] = [
  "add_to_cart",
  "view_cart",
  "recommendation",
];
