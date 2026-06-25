/** India-focused product aliases (Hinglish → English catalog terms). */
export const HINGLISH_PRODUCT_ALIASES: Record<string, string> = {
  aam: "mango",
  doodh: "milk",
  kela: "banana",
  kele: "banana",
  dahi: "curd",
  chawal: "rice",
  atta: "flour",
  tel: "oil",
  aloo: "potato",
  tamatar: "tomato",
  pyaz: "onion",
  palak: "spinach",
  gajar: "carrot",
  gobhi: "cauliflower",
  matar: "peas",
  nimbu: "lemon",
  adrak: "ginger",
  lahsun: "garlic",
  mirch: "chilli",
  dal: "lentils",
  paneer: "cottage cheese",
  makhan: "butter",
  cheeni: "sugar",
  namak: "salt",
  sabzi: "vegetables",
  phal: "fruit",
};

/** Hindi quantity words written in English script. */
export const HINGLISH_QUANTITY_WORDS: Record<string, string> = {
  ek: "1",
  do: "2",
  teen: "3",
  chaar: "4",
  char: "4",
  paanch: "5",
  chhe: "6",
};

/** @deprecated Use HINGLISH_PRODUCT_ALIASES and HINGLISH_QUANTITY_WORDS */
export const HINGLISH_MAP: Record<string, string> = {
  ...HINGLISH_PRODUCT_ALIASES,
  ...HINGLISH_QUANTITY_WORDS,
};

const MEIN_SUFFIX = "(?:mein|mei|me|main|ma|men)";
const CART_NOUN = "(?:cart|basket|bag)";
const CHAHIYE = "(?:chahiye|chaiye|chahie|chiye|chaie)";
const KARO = "(?:karo|kardo|kar\\s*do|kar-do|kijiye)";

type CommercePhraseRule = {
  pattern: RegExp;
  replacement: string;
};

/**
 * Map common Hinglish commerce phrases to English equivalents understood by
 * intent patterns and cart parsers. Order matters — more specific rules first.
 */
const COMMERCE_PHRASE_RULES: CommercePhraseRule[] = [
  {
    pattern: new RegExp(
      `\\b(.+?)\\s+${CART_NOUN}\\s*${MEIN_SUFFIX}\\s+(?:daal|dal)\\s+(?:do|dijiye|${KARO})\\b`,
      "gi",
    ),
    replacement: "add $1 to cart",
  },
  {
    pattern: new RegExp(
      `\\b(?:add|(?:daal|dal))\\s+${KARO}\\s+${CART_NOUN}\\s*${MEIN_SUFFIX}?\\b`,
      "gi",
    ),
    replacement: "add to cart",
  },
  {
    pattern: new RegExp(
      `\\b${CART_NOUN}\\s*${MEIN_SUFFIX}\\s+(?:daal|dal)\\s+(?:do|dijiye|dena|${KARO})\\b`,
      "gi",
    ),
    replacement: "add to cart",
  },
  {
    pattern: new RegExp(
      `\\b${CART_NOUN}\\s*${MEIN_SUFFIX}\\s+(?:add|(?:daal|dal))\\s+${KARO}\\b`,
      "gi",
    ),
    replacement: "add to cart",
  },
  {
    pattern: new RegExp(
      `\\b(?:ek|1|one)\\s+(?:aur|or)\\s+(?:add|(?:daal|dal))\\s+${KARO}\\b`,
      "gi",
    ),
    replacement: "add one more",
  },
  {
    pattern: /\b(?:kitne|kitna|kya)\s+(?:ka|ke|ki)\s+(?:hai|h|he|hain|ho)\??/gi,
    replacement: "how much does it cost",
  },
  {
    pattern: /\b(?:rate|price|daam|dam)\s+(?:kya|kitna|kitne)\s+(?:hai|h|he|hain)\??/gi,
    replacement: "how much does it cost",
  },
  {
    pattern: /\b(?:kitne|kitna)\s+(?:mein|mei|me|main|ma|men)\s+(?:milega|milegi|milta|milti)\??/gi,
    replacement: "how much does it cost",
  },
  {
    pattern: /^dikha(?:o|do|iye|ye|na)\s*$/gi,
    replacement: "show products",
  },
  {
    pattern: /\bdikha(?:o|do|iye|ye|na)\s+(?:products?|samaan|cheezein|items?|list|menu)\b/gi,
    replacement: "show products",
  },
  {
    pattern: /\b(?:products?|samaan|cheezein|items?|list|menu)\s+dikha(?:o|do|iye|ye|na)\b/gi,
    replacement: "show products",
  },
  {
    pattern: new RegExp(`\\bmujhe\\s+(.+?)\\s+${CHAHIYE}\\b`, "gi"),
    replacement: "i want $1",
  },
  {
    pattern: new RegExp(`\\b(?:mujko|muje|mko|mujhe)\\s+${CHAHIYE}\\b`, "gi"),
    replacement: "i want to buy",
  },
  {
    pattern: /\b(?:order|mera\s+order)\s+(?:kaha|kahan|kha)\s+(?:hai|h|he|hain)\??/gi,
    replacement: "where is my order",
  },
  {
    pattern: /\b(?:order|mera\s+order)\s+(?:ka|ki)\s+(?:status|hal|haal)\s*(?:kya|kya\s+hai)\??/gi,
    replacement: "track order",
  },
  {
    pattern:
      /\b(?:return|wapas|vapas)\s+(?:karna\s+hai|krna\s+hai|karna|krna|chahiye|chahte?\s+(?:hain|ho|hu))\b/gi,
    replacement: "i want to return",
  },
  {
    pattern: new RegExp(`\\brefund\\s+${CHAHIYE}\\b`, "gi"),
    replacement: "i want a refund",
  },
  {
    pattern: new RegExp(`\\bpaise\\s+(?:wapas|vapas)\\s+${CHAHIYE}\\b`, "gi"),
    replacement: "i want a refund",
  },
  {
    pattern: new RegExp(`\\b(?:paise|money)\\s+${CHAHIYE}\\b`, "gi"),
    replacement: "i want a refund",
  },
  {
    pattern: /^aur\s+/gi,
    replacement: "",
  },
];

/** Normalize Hinglish commerce phrases to English intent/cart phrasing. */
export function normalizeCommercePhrases(input: string): string {
  let normalized = input.trim().toLowerCase();
  for (const rule of COMMERCE_PHRASE_RULES) {
    normalized = normalized.replace(rule.pattern, rule.replacement);
  }
  return normalized.replace(/\s+/g, " ").trim();
}

function applyWordMap(input: string, map: Record<string, string>): string {
  let normalized = input.toLowerCase();
  for (const [source, target] of Object.entries(map)) {
    normalized = normalized.replace(new RegExp(`\\b${source}\\b`, "gi"), target);
  }
  return normalized;
}

export function normalizeProductAliases(input: string): string {
  return applyWordMap(input, HINGLISH_PRODUCT_ALIASES);
}

export function normalizeQuantityWords(input: string): string {
  return applyWordMap(input, HINGLISH_QUANTITY_WORDS);
}

export function normalizeQuery(input: string): string {
  return normalizeProductAliases(input);
}

/** Product aliases + Hindi quantity words (for cart parsing only). */
export function normalizeCartText(input: string): string {
  return normalizeQuantityWords(normalizeProductAliases(input));
}

/** Full preprocessing: commerce phrase normalization then product/number mapping. */
export function normalizeCommerceMessage(input: string): string {
  const phraseNormalized = normalizeCommercePhrases(input);
  return normalizeCartText(phraseNormalized);
}

/** Original and normalized variants for intent pattern matching. */
export function commerceMessageCandidates(message: string): string[] {
  const trimmed = message.trim();
  if (!trimmed) return [];

  const normalized = normalizeCommerceMessage(trimmed);
  if (normalized === trimmed.toLowerCase()) {
    return [trimmed];
  }

  return [...new Set([trimmed, normalized])];
}
