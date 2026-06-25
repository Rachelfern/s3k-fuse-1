import { normalizeQuery } from "@/lib/hinglish";
import {
  scoreProductMatch,
  tokenizeProductText,
} from "@/lib/ai/product-search";
import type { GroundedProduct } from "@/lib/ai/product-grounding";

export type CartLineForRemoval = {
  cartItemId: string;
  product_id: string;
  name_en: string;
  quantity: number;
  price: number;
};

export type RemoveQuantitySpec =
  | { mode: "all_matching" }
  | { mode: "partial"; amount: number };

export type ParsedRemoveRequest = {
  productQuery: string;
  quantity: RemoveQuantitySpec;
};

const REMOVE_KEYWORD_PATTERN =
  /\b(?:remove|delete|discard|exclude|cancel)\b|\btake\s+.+\s+out\b|\bdon'?t\s+want\b/i;

const REMOVE_STOP_WORDS = new Set([
  "remove",
  "delete",
  "discard",
  "exclude",
  "cancel",
  "take",
  "out",
  "from",
  "my",
  "the",
  "a",
  "an",
  "cart",
  "please",
  "all",
  "item",
  "items",
  "pack",
  "packs",
  "dont",
  "don't",
  "want",
  "of",
]);

export function isCartRemoveMessage(message: string): boolean {
  return REMOVE_KEYWORD_PATTERN.test(message.trim());
}

export function parseRemoveRequest(message: string): ParsedRemoveRequest | null {
  const normalized = normalizeQuery(message.trim());
  if (!isCartRemoveMessage(normalized)) return null;

  const removeAllMatch = normalized.match(
    /\b(?:remove|delete|discard|exclude)\s+all\s+(.+?)(?:\s+from\s+(?:my\s+)?cart)?\s*$/i,
  );
  if (removeAllMatch) {
    const query = cleanProductQuery(removeAllMatch[1]);
    if (query) {
      return { productQuery: query, quantity: { mode: "all_matching" } };
    }
  }

  const partialMatch = normalized.match(
    /\b(?:remove|delete|discard|exclude)\s+(\d+)\s+(.+?)(?:\s+packs?|\s+items?)?(?:\s+from\s+(?:my\s+)?cart)?\s*$/i,
  );
  if (partialMatch) {
    const amount = Number.parseInt(partialMatch[1], 10);
    const query = cleanProductQuery(partialMatch[2]);
    if (query && amount > 0) {
      return {
        productQuery: query,
        quantity: { mode: "partial", amount },
      };
    }
  }

  const takeOutMatch = normalized.match(/\btake\s+(.+?)\s+out(?:\s+of\s+(?:my\s+)?cart)?\s*$/i);
  if (takeOutMatch) {
    const query = cleanProductQuery(takeOutMatch[1]);
    if (query) {
      return { productQuery: query, quantity: { mode: "all_matching" } };
    }
  }

  const dontWantMatch = normalized.match(/\bdon'?t\s+want\s+(.+?)(?:\s+anymore)?\s*$/i);
  if (dontWantMatch) {
    const query = cleanProductQuery(dontWantMatch[1]);
    if (query) {
      return { productQuery: query, quantity: { mode: "all_matching" } };
    }
  }

  const genericMatch = normalized.match(
    /\b(?:remove|delete|discard|exclude|cancel)\s+(?:the\s+)?(.+?)(?:\s+from\s+(?:my\s+)?cart)?\s*$/i,
  );
  if (genericMatch) {
    const query = cleanProductQuery(genericMatch[1]);
    if (query) {
      return { productQuery: query, quantity: { mode: "all_matching" } };
    }
  }

  return null;
}

function cleanProductQuery(raw: string): string {
  return raw
    .replace(/\b(?:packs?|items?|please)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toGroundedProduct(line: CartLineForRemoval): GroundedProduct {
  return {
    id: line.product_id,
    name_en: line.name_en,
    name_hi: "",
    price: line.price,
    stock: 0,
    image_url: null,
    category: "",
    description: null,
  };
}

export function findCartItemsForRemoval(
  query: string,
  cartLines: CartLineForRemoval[],
): CartLineForRemoval[] {
  const normalizedQuery = normalizeQuery(query).trim();
  if (!normalizedQuery || cartLines.length === 0) return [];

  const scored = cartLines
    .map((line) => ({
      line,
      score: scoreProductMatch(normalizedQuery, toGroundedProduct(line)),
    }))
    .filter((match) => match.score >= 0.5)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return [];

  return scored.map((row) => row.line);
}

export function logCartRemoveDebug(input: {
  message: string;
  detectedIntent: string;
  matchedProduct: string | null;
  cartBefore: { name: string; quantity: number }[];
  cartAfter: { name: string; quantity: number }[];
  removeSpec: RemoveQuantitySpec | null;
}): void {
  console.log("[CART_REMOVE]", {
    detectedIntent: input.detectedIntent,
    message: input.message,
    matchedProduct: input.matchedProduct,
    removeSpec: input.removeSpec,
    cartBefore: input.cartBefore,
    cartAfter: input.cartAfter,
  });
}

export function describeCartLines(lines: CartLineForRemoval[]): string {
  return lines.map((line) => `${line.name_en} × ${line.quantity}`).join(", ");
}

export function extractRemoveProductTokens(query: string): string[] {
  return tokenizeProductText(query).filter((token) => !REMOVE_STOP_WORDS.has(token));
}
