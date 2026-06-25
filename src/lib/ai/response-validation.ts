import { sanitizeAdminBubbleContent } from "@/lib/chat/message-display";

export const ASSISTANT_FALLBACK_RESPONSE =
  "Sorry, I couldn't understand that request.\n\nTry View Cart, Track Order, Best Sellers, or Browse Products — tap a button below or type your question.";

const PAGE_REFERENCE_PATTERNS = [
  /\b(?:go to|visit|open|check|head to)\s+(?:the\s+)?(?:orders?\s+(?:page|section)|dashboard|cart\s+page|checkout\s+page|products?\s+page)\b/i,
  /\b(?:orders?\s+(?:page|section)|your dashboard)\b/i,
];

/** Devanagari, Tamil, Gujarati, Bengali, Kannada, Malayalam, Telugu, Gurmukhi */
const NON_ENGLISH_SCRIPT =
  /[\u0900-\u097F\u0980-\u09FF\u0A00-\u0A7F\u0A80-\u0AFF\u0B00-\u0B7F\u0B80-\u0BFF\u0C00-\u0C7F\u0C80-\u0CFF\u0D00-\u0D7F\u0D80-\u0DFF]/;

const GIBBERISH_PATTERNS = [
  /^forgiveness/i,
  /\.\.\.\s*[\u0900-\u097F]/,
  /\[[^\]]{0,80}\]\s*\[[^\]]{0,80}\]/,
  /(?:^|\s)[\u0900-\u097F]{3,}/,
];

const EXCESSIVE_BRACKETS = /(\[[^\]]*\]){3,}/;

export function containsNonEnglishScript(text: string): boolean {
  return NON_ENGLISH_SCRIPT.test(text);
}

export function hasExcessiveBrackets(text: string): boolean {
  return EXCESSIVE_BRACKETS.test(text);
}

export function looksLikeGibberish(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  if (trimmed.length < 3) return true;
  return GIBBERISH_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export type ResponseValidationResult = {
  valid: boolean;
  reason?: string;
};

export function validateAssistantResponse(text: string): ResponseValidationResult {
  const trimmed = text.trim();

  if (!trimmed) {
    return { valid: false, reason: "empty" };
  }

  if (containsNonEnglishScript(trimmed)) {
    return { valid: false, reason: "non_english_script" };
  }

  if (hasExcessiveBrackets(trimmed)) {
    return { valid: false, reason: "excessive_brackets" };
  }

  if (looksLikeGibberish(trimmed)) {
    return { valid: false, reason: "gibberish" };
  }

  return { valid: true };
}

export function sanitizeAssistantResponse(text: string): string {
  const result = validateAssistantResponse(text);
  const trimmed = sanitizeAdminBubbleContent(text.trim());

  if (PAGE_REFERENCE_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    console.warn("[AI_VALIDATION] Rejected page reference in assistant response:", {
      preview: trimmed.slice(0, 120),
    });
    return ASSISTANT_FALLBACK_RESPONSE;
  }

  if (result.valid) {
    return trimmed;
  }

  console.warn("[AI_VALIDATION] Rejected assistant response:", {
    reason: result.reason,
    preview: text.slice(0, 120),
  });

  return ASSISTANT_FALLBACK_RESPONSE;
}
