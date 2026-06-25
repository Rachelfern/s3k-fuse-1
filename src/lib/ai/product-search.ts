import { normalizeQuery } from "@/lib/hinglish";
import type { GroundedProduct } from "@/lib/ai/product-grounding";
import { isQuantityOnlyToken } from "@/lib/ai/product-entity-extraction";

const STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "some",
  "of",
  "to",
  "in",
  "my",
  "cart",
  "please",
  "want",
  "would",
  "like",
  "need",
  "get",
  "buy",
  "order",
  "purchase",
  "add",
  "put",
  "take",
  "i",
  "me",
  "for",
  "and",
  "with",
  "aur",
  "plus",
]);

export type ProductSearchMatch = {
  product: GroundedProduct;
  score: number;
};

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix: number[][] = Array.from({ length: a.length + 1 }, () =>
    Array<number>(b.length + 1).fill(0),
  );

  for (let i = 0; i <= a.length; i += 1) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) matrix[0][j] = j;

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }

  return matrix[a.length][b.length];
}

export function stemWord(word: string): string {
  let stem = word.toLowerCase();
  if (stem.endsWith("ies") && stem.length > 4) {
    return `${stem.slice(0, -3)}y`;
  }
  if (stem.endsWith("es") && stem.length > 3) {
    return stem.slice(0, -2);
  }
  if (stem.endsWith("s") && stem.length > 3) {
    return stem.slice(0, -1);
  }
  return stem;
}

export function tokenizeProductText(text: string): string[] {
  return normalizeQuery(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(
      (token) =>
        token.length > 1 &&
        !STOP_WORDS.has(token) &&
        !isQuantityOnlyToken(token) &&
        !/^\d+$/.test(token),
    );
}

function tokenSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const stemA = stemWord(a);
  const stemB = stemWord(b);
  if (stemA === stemB) return 0.95;
  if (stemA.includes(stemB) || stemB.includes(stemA)) return 0.85;

  const maxLen = Math.max(stemA.length, stemB.length);
  if (maxLen === 0) return 0;

  const distance = levenshtein(stemA, stemB);
  const allowed = maxLen >= 6 ? 2 : maxLen >= 4 ? 1 : 0;
  if (distance <= allowed) {
    return 1 - distance / maxLen;
  }

  return 0;
}

function scoreTokenAgainstProduct(token: string, product: GroundedProduct): number {
  const productTokens = [
    ...tokenizeProductText(product.name_en),
    ...tokenizeProductText(product.name_hi ?? ""),
    ...tokenizeProductText(product.category ?? ""),
  ];

  let best = 0;
  for (const productToken of productTokens) {
    best = Math.max(best, tokenSimilarity(token, productToken));
  }

  const nameLower = product.name_en.toLowerCase();
  const tokenStem = stemWord(token);
  if (nameLower.includes(token) || nameLower.includes(tokenStem)) {
    best = Math.max(best, 0.9);
  }

  return best;
}

function normalizedLevenshteinScore(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const distance = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length);
  return Math.max(0, 1 - distance / maxLen);
}

function scoreFullNameMatch(query: string, product: GroundedProduct): number {
  const queryNorm = query.toLowerCase().replace(/[^a-z0-9\s]/g, " ").trim();
  if (!queryNorm) return 0;

  const names = [product.name_en, product.name_hi ?? ""].filter(Boolean);
  let best = 0;

  for (const name of names) {
    const nameLower = name.toLowerCase();
    if (nameLower.includes(queryNorm) || queryNorm.includes(nameLower)) {
      best = Math.max(best, 0.92);
      continue;
    }

    const queryStem = stemWord(queryNorm.replace(/\s+/g, ""));
    const nameWords = tokenizeProductText(name);
    for (const word of nameWords) {
      best = Math.max(best, tokenSimilarity(queryNorm, word));
      if (queryNorm.split(/\s+/).length === 1) {
        best = Math.max(best, tokenSimilarity(queryStem, stemWord(word)));
      }
    }

    const nameCompact = nameWords.map(stemWord).join("");
    const queryCompact = queryNorm.split(/\s+/).map(stemWord).join("");
    best = Math.max(best, normalizedLevenshteinScore(queryCompact, nameCompact));

    const primaryToken = nameWords[0];
    if (primaryToken && queryNorm.split(/\s+/).length === 1) {
      best = Math.max(
        best,
        normalizedLevenshteinScore(stemWord(queryNorm), stemWord(primaryToken)),
      );
    }
  }

  return best;
}

export function scoreProductMatch(
  query: string,
  product: GroundedProduct,
): number {
  const queryTokens = tokenizeProductText(query);
  const fullNameScore = scoreFullNameMatch(query, product);

  if (queryTokens.length === 0) {
    return fullNameScore >= 0.55 ? fullNameScore : 0;
  }

  const nameTokens = tokenizeProductText(product.name_en);
  const tokenScores = queryTokens.map((token) =>
    scoreTokenAgainstProduct(token, product),
  );
  const avgTokenScore =
    tokenScores.reduce((sum, score) => sum + score, 0) / queryTokens.length;

  const queryNorm = queryTokens.join(" ");
  const nameNorm = nameTokens.join(" ");
  let bonus = 0;

  if (nameNorm.includes(queryNorm) || queryNorm.includes(nameNorm)) {
    bonus += 0.25;
  }

  const category = product.category?.toLowerCase() ?? "";
  if (category && queryTokens.some((token) => category.includes(stemWord(token)))) {
    bonus += 0.1;
  }

  const coverage =
    tokenScores.filter((score) => score >= 0.75).length / queryTokens.length;
  const blended = Math.max(avgTokenScore + bonus, fullNameScore);

  if (coverage < 0.5 && fullNameScore < 0.55) {
    return 0;
  }

  return Math.min(1, blended);
}

export function searchProductsForCart(
  query: string,
  products: GroundedProduct[],
  options?: { minScore?: number; limit?: number },
): ProductSearchMatch[] {
  const minScore = options?.minScore ?? 0.55;
  const limit = options?.limit ?? 5;
  const normalizedQuery = normalizeQuery(query).trim();

  if (!normalizedQuery) return [];

  const scored = products
    .map((product) => ({
      product,
      score: scoreProductMatch(normalizedQuery, product),
    }))
    .filter((match) => match.score >= minScore)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, limit);
}

export function findAmbiguousMatches(
  matches: ProductSearchMatch[],
): ProductSearchMatch[] {
  if (matches.length <= 1) return matches;

  const topScore = matches[0].score;
  const closeMatches = matches.filter((match) => topScore - match.score <= 0.08);

  const topTokens = new Set(tokenizeProductText(matches[0].product.name_en));
  const sameFamily = closeMatches.filter((match) => {
    const tokens = tokenizeProductText(match.product.name_en);
    return tokens.some((token) => topTokens.has(token));
  });

  return sameFamily.length > 1 ? sameFamily : [matches[0]];
}
