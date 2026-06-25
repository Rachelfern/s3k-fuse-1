import { normalizeQuery } from "@/lib/hinglish";
import type { GroundedProduct } from "@/lib/ai/product-grounding";
import {
  extractProductEntity,
  extractProductSegments,
  normalizeWordQuantities,
  type ExtractedProductEntity,
} from "@/lib/ai/product-entity-extraction";
import {
  findAmbiguousMatches,
  searchProductsForCart,
  tokenizeProductText,
  type ProductSearchMatch,
} from "@/lib/ai/product-search";

export type CatalogUnit =
  | { kind: "weight"; grams: number }
  | { kind: "volume"; milliliters: number }
  | { kind: "count"; units: number };

export type RequestedQuantity =
  | { kind: "weight"; grams: number; display: string }
  | { kind: "volume"; milliliters: number; display: string }
  | { kind: "count"; units: number; display: string }
  | { kind: "packs"; packs: number; display: string };

export type ParsedCartLine = {
  product: GroundedProduct;
  quantity: number;
  requested: RequestedQuantity | null;
  inferredConversion: boolean;
};

export type ParseCartIntentResult =
  | { status: "no_match"; message: string }
  | {
      status: "ambiguous";
      query: string;
      candidates: GroundedProduct[];
      message: string;
    }
  | {
      status: "confirm";
      lines: ParsedCartLine[];
      message: string;
    }
  | {
      status: "ready";
      lines: ParsedCartLine[];
    };

const WEIGHT_PATTERN =
  /(\d+(?:\.\d+)?)\s*(kg|kilograms?|g|grams?|gm)\b/i;
const VOLUME_PATTERN =
  /(\d+(?:\.\d+)?)\s*(l|litre?s?|liters?|ml|millilitre?s?|milliliters?)\b/i;
const PACK_PATTERN = /(\d+)\s*(?:x|×|packs?|packets?|pcs?|pieces?)\b/i;
const COUNT_PATTERN = /\b(\d+)\b/;

export function parseCatalogUnit(productName: string): CatalogUnit | null {
  const weightMatch = productName.match(/(\d+(?:\.\d+)?)\s*(kg|g|gm|grams?)\b/i);
  if (weightMatch) {
    const value = Number.parseFloat(weightMatch[1]);
    const unit = weightMatch[2].toLowerCase();
    const grams = unit.startsWith("kg") ? value * 1000 : value;
    return { kind: "weight", grams };
  }

  const volumeMatch = productName.match(
    /(\d+(?:\.\d+)?)\s*(l|litre?s?|liters?|ml|millilitre?s?|milliliters?)\b/i,
  );
  if (volumeMatch) {
    const value = Number.parseFloat(volumeMatch[1]);
    const unit = volumeMatch[2].toLowerCase();
    const milliliters = unit.startsWith("l") && !unit.startsWith("ml") ? value * 1000 : value;
    return { kind: "volume", milliliters };
  }

  const countMatch = productName.match(/(\d+)\s*(?:pc|pcs|piece|pieces|unit|units)\b/i);
  if (countMatch) {
    return { kind: "count", units: Number.parseInt(countMatch[1], 10) };
  }

  return null;
}

export function extractProductQuery(message: string): string {
  return extractProductEntity(message).productQuery;
}

export function extractRequestedQuantity(message: string): RequestedQuantity | null {
  const normalized = normalizeWordQuantities(message);

  const weightMatch = normalized.match(WEIGHT_PATTERN);
  if (weightMatch) {
    const value = Number.parseFloat(weightMatch[1]);
    const unit = weightMatch[2].toLowerCase();
    const grams = unit.startsWith("kg") ? value * 1000 : value;
    return {
      kind: "weight",
      grams,
      display: unit.startsWith("kg") ? `${value}kg` : `${value}g`,
    };
  }

  const volumeMatch = normalized.match(VOLUME_PATTERN);
  if (volumeMatch) {
    const value = Number.parseFloat(volumeMatch[1]);
    const unit = volumeMatch[2].toLowerCase();
    const milliliters =
      unit.startsWith("l") && !unit.startsWith("ml") ? value * 1000 : value;
    return {
      kind: "volume",
      milliliters,
      display:
        unit.startsWith("l") && !unit.startsWith("ml") ? `${value}L` : `${value}ml`,
    };
  }

  const packMatch = normalized.match(PACK_PATTERN);
  if (packMatch) {
    const packs = Number.parseInt(packMatch[1], 10);
    if (packs > 0) {
      return { kind: "packs", packs, display: `${packs} packs` };
    }
  }

  const countMatch = normalized.match(COUNT_PATTERN);
  if (countMatch) {
    const units = Number.parseInt(countMatch[1], 10);
    if (units > 0) {
      return { kind: "count", units, display: `${units}` };
    }
  }

  return null;
}

function computeLineQuantity(
  product: GroundedProduct,
  requested: RequestedQuantity | null,
): { quantity: number; inferredConversion: boolean } {
  const catalogUnit = parseCatalogUnit(product.name_en);

  if (!requested) {
    return { quantity: 1, inferredConversion: false };
  }

  if (requested.kind === "packs") {
    return { quantity: requested.packs, inferredConversion: false };
  }

  if (requested.kind === "count") {
    if (catalogUnit?.kind === "count") {
      const packs = Math.ceil(requested.units / catalogUnit.units);
      return {
        quantity: packs,
        inferredConversion: packs * catalogUnit.units !== requested.units,
      };
    }
    return { quantity: requested.units, inferredConversion: false };
  }

  if (requested.kind === "weight" && catalogUnit?.kind === "weight") {
    const packs = Math.ceil(requested.grams / catalogUnit.grams);
    return {
      quantity: packs,
      inferredConversion: true,
    };
  }

  if (requested.kind === "volume" && catalogUnit?.kind === "volume") {
    const packs = Math.ceil(requested.milliliters / catalogUnit.milliliters);
    return { quantity: packs, inferredConversion: false };
  }

  return { quantity: 1, inferredConversion: false };
}

function formatConfirmationMessage(line: ParsedCartLine): string {
  const { product, quantity, requested } = line;
  const lines = [`I found ${product.name_en}.`];

  if (requested?.kind === "weight" && quantity > 1) {
    lines.push(
      `${requested.display} would be ${quantity} pack${quantity === 1 ? "" : "s"} (${requested.grams}g total).`,
    );
  } else if (requested?.kind === "volume" && quantity > 1) {
    lines.push(
      `${requested.display} would be ${quantity} pack${quantity === 1 ? "" : "s"}.`,
    );
  }

  lines.push(
    `Would you like me to add ${quantity} pack${quantity === 1 ? "" : "s"} to your cart?`,
  );

  return lines.join("\n\n");
}

export function formatClarifyLabel(productName: string): string {
  const volumeMatch = productName.match(/(\d+(?:\.\d+)?\s*(?:ml|l|litre?s?|liters?))\b/i);
  if (volumeMatch) return volumeMatch[1].replace(/\s+/g, "");

  const weightMatch = productName.match(/(\d+(?:\.\d+)?\s*(?:kg|g|gm))\b/i);
  if (weightMatch) return weightMatch[1].replace(/\s+/g, "");

  return productName;
}

function formatAmbiguousMessage(_candidates: GroundedProduct[]): string {
  return "Which one would you like?";
}

function resolveQuantityAwareMatches(
  message: string,
  matches: ProductSearchMatch[],
  requested: RequestedQuantity | null,
): ProductSearchMatch[] {
  if (matches.length <= 1 || !requested) return matches;

  if (requested.kind === "volume") {
    const prefersLitres =
      /\b(?:l|litre?s?|liters?)\b/i.test(message) && !/\bml\b/i.test(message);

    const ranked = matches
      .map((match) => {
        const catalogUnit = parseCatalogUnit(match.product.name_en);
        if (catalogUnit?.kind !== "volume") return null;

        if (requested.milliliters % catalogUnit.milliliters !== 0) return null;

        const packs = requested.milliliters / catalogUnit.milliliters;
        let fit = 1 / packs;
        if (prefersLitres && catalogUnit.milliliters >= 1000) fit += 1;
        if (!prefersLitres && catalogUnit.milliliters < 1000) fit += 0.5;

        return { match, fit };
      })
      .filter((entry): entry is { match: ProductSearchMatch; fit: number } =>
        Boolean(entry),
      )
      .sort((a, b) => b.fit - a.fit);

    if (ranked.length === 1) return [ranked[0].match];
    if (
      ranked.length > 1 &&
      ranked[0].fit - ranked[1].fit > 0.25
    ) {
      return [ranked[0].match];
    }
  }

  if (requested.kind === "weight") {
    const ranked = matches
      .map((match) => {
        const catalogUnit = parseCatalogUnit(match.product.name_en);
        if (catalogUnit?.kind !== "weight") return null;
        if (requested.grams % catalogUnit.grams !== 0) return null;

        const packs = requested.grams / catalogUnit.grams;
        return { match, fit: 1 / packs };
      })
      .filter((entry): entry is { match: ProductSearchMatch; fit: number } =>
        Boolean(entry),
      )
      .sort((a, b) => b.fit - a.fit);

    if (ranked.length === 1) return [ranked[0].match];
    if (
      ranked.length > 1 &&
      ranked[0].fit - ranked[1].fit > 0.25
    ) {
      return [ranked[0].match];
    }
  }

  return matches;
}

function formatMultiConfirmationMessage(lines: ParsedCartLine[]): string {
  const summary = lines
    .map(
      (line) =>
        `${line.product.name_en} × ${line.quantity}`,
    )
    .join(", ");

  return `I found ${summary}. Would you like me to add these to your cart?`;
}

function parseSingleCartSegment(
  segment: ExtractedProductEntity,
  message: string,
  products: GroundedProduct[],
): ParseCartIntentResult {
  const { productQuery, normalizedMessage } = segment;
  const requested = extractRequestedQuantity(normalizedMessage);
  const queryTokens = tokenizeProductText(productQuery);

  if (queryTokens.length === 0 && !requested) {
    return {
      status: "no_match",
      message: "I couldn't match those items to our catalog. Could you try again?",
    };
  }

  const searchQuery = productQuery || normalizeWordQuantities(message);
  const rawMatches = searchProductsForCart(searchQuery, products);

  if (rawMatches.length === 0) {
    return {
      status: "no_match",
      message: "I couldn't match those items to our catalog. Could you try again?",
    };
  }

  const matches = resolveQuantityAwareMatches(message, rawMatches, requested);
  const ambiguous = findAmbiguousMatches(matches);
  if (ambiguous.length > 1) {
    return {
      status: "ambiguous",
      query: productQuery,
      candidates: ambiguous.map((match) => match.product),
      message: formatAmbiguousMessage(ambiguous.map((match) => match.product)),
    };
  }

  const product = ambiguous[0].product;
  const { quantity, inferredConversion } = computeLineQuantity(product, requested);
  const line: ParsedCartLine = {
    product,
    quantity: Math.max(1, quantity),
    requested,
    inferredConversion,
  };

  if (inferredConversion) {
    return {
      status: "confirm",
      lines: [line],
      message: formatConfirmationMessage(line),
    };
  }

  return {
    status: "ready",
    lines: [line],
  };
}

export function parseCartIntent(
  message: string,
  products: GroundedProduct[],
): ParseCartIntentResult {
  const segments = extractProductSegments(message);

  if (segments.length <= 1) {
    const segment = segments[0] ?? extractProductEntity(message);
    return parseSingleCartSegment(segment, message, products);
  }

  const allLines: ParsedCartLine[] = [];
  let needsConfirm = false;

  for (const segment of segments) {
    const result = parseSingleCartSegment(segment, message, products);

    if (result.status === "ambiguous") {
      return result;
    }

    if (result.status === "no_match") {
      return {
        status: "no_match",
        message: "I couldn't match those items to our catalog. Could you try again?",
      };
    }

    if (result.status === "confirm" || result.status === "ready") {
      allLines.push(...result.lines);
      if (result.status === "confirm") {
        needsConfirm = true;
      }
    }
  }

  if (allLines.length === 0) {
    return {
      status: "no_match",
      message: "I couldn't match those items to our catalog. Could you try again?",
    };
  }

  if (needsConfirm) {
    return {
      status: "confirm",
      lines: allLines,
      message: formatMultiConfirmationMessage(allLines),
    };
  }

  return {
    status: "ready",
    lines: allLines,
  };
}

export function parseExplicitCartItems(
  message: string,
  products: GroundedProduct[],
): ParsedCartLine[] {
  const intent = parseCartIntent(message, products);
  if (intent.status === "ready") return intent.lines;
  if (intent.status === "confirm") return intent.lines;
  return [];
}
