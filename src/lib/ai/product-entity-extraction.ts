import { normalizeCommerceMessage } from "@/lib/hinglish";

/** English word quantities → digits (applied before catalog lookup). */
export const WORD_NUMBERS: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  a: 1,
  an: 1,
  couple: 2,
  few: 3,
  dozen: 12,
};

const CART_ACTION_PATTERNS = [
  /\b(?:please\s+)?(?:add|put|order|buy|purchase|get|take)\b/gi,
  /\b(?:i\s+)?(?:want|would like|need)\s+(?:to\s+)?(?:add|get|buy|order|purchase)\b/gi,
  /\b(?:i\s+)?(?:want|would like|need)\s+(?!to\b)/gi,
  /\b(?:in|to|into)\s+(?:my\s+)?(?:cart|basket|bag)\b/gi,
  /\b(?:this|that|it)\b/gi,
  /\b(?:chahiye|chaiye|chahie|chiye|chaie)\b/gi,
];

const MULTI_PRODUCT_CONNECTOR =
  /\s+(?:aur|and|plus|\+|with|along\s+with)\s+/i;

/** Split a message into per-product segments joined by aur/and/plus/etc. */
export function splitMultiProductMessage(message: string): string[] {
  const normalized = normalizeWordQuantities(message)
    .replace(/\b(?:chahiye|chaiye|chahie|chiye|chaie|please|plz)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) return [];

  const segments = normalized
    .split(MULTI_PRODUCT_CONNECTOR)
    .map((segment) => segment.trim())
    .filter(Boolean);

  return segments.length > 0 ? segments : [normalized];
}

export function extractProductSegments(message: string): ExtractedProductEntity[] {
  return splitMultiProductMessage(message).map((segment) =>
    extractProductEntity(segment),
  );
}

const WEIGHT_PATTERN =
  /(\d+(?:\.\d+)?)\s*(kg|kilograms?|g|grams?|gm)\b/gi;
const VOLUME_PATTERN =
  /(\d+(?:\.\d+)?)\s*(l|litre?s?|liters?|ml|millilitre?s?|milliliters?)\b/gi;
const PACK_PATTERN = /(\d+)\s*(?:x|×|packs?|packets?|pcs?|pieces?)\b/gi;
const COUNT_PATTERN = /\b(\d+)\b/g;

const QUANTITY_ONLY_TOKENS = new Set([
  ...Object.keys(WORD_NUMBERS),
  ...Object.values(WORD_NUMBERS).map(String),
]);

export function normalizeWordQuantities(text: string): string {
  let normalized = normalizeCommerceMessage(text);
  for (const [word, value] of Object.entries(WORD_NUMBERS)) {
    normalized = normalized.replace(
      new RegExp(`\\b${word}\\b`, "gi"),
      String(value),
    );
  }
  return normalized;
}

export type ExtractedProductEntity = {
  /** Product name tokens after stripping cart verbs and quantities. */
  productQuery: string;
  /** Message with word quantities converted to digits (quantities preserved). */
  normalizedMessage: string;
};

/** Strip cart phrasing and quantity markers; return the product search query. */
export function extractProductEntity(message: string): ExtractedProductEntity {
  const normalizedMessage = normalizeWordQuantities(message);

  let stripped = normalizedMessage;
  for (const pattern of CART_ACTION_PATTERNS) {
    stripped = stripped.replace(pattern, " ");
  }

  stripped = stripped
    .replace(WEIGHT_PATTERN, " ")
    .replace(VOLUME_PATTERN, " ")
    .replace(PACK_PATTERN, " ")
    .replace(COUNT_PATTERN, " ")
    .replace(/\s+/g, " ")
    .trim();

  const productQuery = stripped
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return { productQuery, normalizedMessage };
}

export function isQuantityOnlyToken(token: string): boolean {
  return QUANTITY_ONLY_TOKENS.has(token.toLowerCase());
}
