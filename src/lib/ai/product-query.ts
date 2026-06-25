import { extractProductEntity } from "@/lib/ai/product-entity-extraction";
import { normalizeCommerceMessage } from "@/lib/hinglish";

export function isOffersQuery(message: string): boolean {
  return /\b(?:today'?s?\s+)?(?:offers?|deals?|discounts?|sales?)\b/i.test(
    message.trim(),
  );
}

/** Strip shopping-intent phrasing to get the product search terms. */
export function extractProductSearchQuery(message: string): string {
  const trimmed = message.trim();
  const normalized = normalizeCommerceMessage(trimmed);

  if (isOffersQuery(trimmed) || isOffersQuery(normalized)) {
    return "__offers__";
  }

  const availabilityMatch = trimmed.match(
    /\b(?:do\s+(?:u|you)\s+have|have\s+(?:u|you)\s+got|got\s+any)\s+(.+?)\??\s*$/i,
  );
  if (availabilityMatch?.[1]) {
    return availabilityMatch[1].replace(/\?+$/, "").trim();
  }

  const showMeMatch = trimmed.match(
    /\bshow\s+(?:me\s+)?(?!(?:my\s+)?(?:cart|order|status)\b)(.+?)\??\s*$/i,
  );
  if (showMeMatch?.[1]) {
    return showMeMatch[1].replace(/\?+$/, "").trim();
  }

  const recommendMatch = trimmed.match(
    /\brecommend(?:ation)?s?\s+(?:a\s+|an\s+|some\s+)?(.+?)\??\s*$/i,
  );
  if (recommendMatch?.[1]) {
    return recommendMatch[1].replace(/\?+$/, "").trim();
  }

  const suggestMatch = trimmed.match(
    /\bsuggest(?:ion)?s?\s+(?:a\s+|an\s+|some\s+)?(.+?)\??\s*$/i,
  );
  if (suggestMatch?.[1]) {
    return suggestMatch[1].replace(/\?+$/, "").trim();
  }

  const { productQuery } = extractProductEntity(trimmed);
  if (productQuery.length >= 2) {
    return productQuery;
  }

  return normalized || trimmed;
}
