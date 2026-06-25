import { normalizeQuery } from "@/lib/hinglish";
import type { GroundedProduct } from "@/lib/ai/product-grounding";
import {
  orderProductsByIds,
  validateRecommendationIds,
} from "@/lib/ai/product-catalog-utils";
import { searchProductsForCart } from "@/lib/ai/product-search";
import {
  isBasketRecommendationRequest,
  isBudgetRecommendationRequest,
  isMealPlanningRequest,
  isRecommendationRequest,
} from "@/lib/ai/message-intent";
import {
  extractProductSearchQuery,
  isOffersQuery,
} from "@/lib/ai/product-query";
import {
  isHighProteinRecommendationRequest,
  rankHighProteinProducts,
} from "@/lib/ai/nutrition-recommendations";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types";

const POPULAR_QUERY_PATTERNS = [
  /\bbest sellers?\b/i,
  /\bpopular products?\b/i,
  /\btrending items?\b/i,
  /\btrending products?\b/i,
  /\btop sellers?\b/i,
  /\bmost (?:ordered|sold|popular)\b/i,
];

export function isPopularProductsQuery(message: string): boolean {
  return POPULAR_QUERY_PATTERNS.some((pattern) => pattern.test(message));
}

export { orderProductsByIds, validateRecommendationIds } from "@/lib/ai/product-catalog-utils";

export async function fetchBestSellerProductIds(
  supabase: SupabaseClient<Database>,
  limit = 4,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("cart_items")
    .select("product_id, quantity");

  if (error) throw error;

  const totals = new Map<string, number>();
  for (const row of data ?? []) {
    if (!row.product_id) continue;
    totals.set(
      row.product_id,
      (totals.get(row.product_id) ?? 0) + row.quantity,
    );
  }

  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([productId]) => productId)
    .slice(0, limit);
}

function applyBudgetFilter(
  message: string,
  products: GroundedProduct[],
): GroundedProduct[] {
  const normalized = normalizeQuery(message).toLowerCase();
  const budgetMatch = normalized.match(/under\s*[₹$]?\s*(\d+)/i);
  if (!budgetMatch) return products;

  const max = Number.parseInt(budgetMatch[1], 10);
  if (!Number.isFinite(max)) return products;

  return products.filter((product) => product.price <= max);
}

function isOpenEndedRecommendation(message: string): boolean {
  return (
    isRecommendationRequest(message) ||
    isBasketRecommendationRequest(message) ||
    isMealPlanningRequest(message) ||
    isBudgetRecommendationRequest(message)
  );
}

function selectCatalogFallbackProducts(input: {
  message: string;
  catalog: GroundedProduct[];
  bestSellerIds: string[];
  limit: number;
}): GroundedProduct[] {
  const budgetFiltered = applyBudgetFilter(input.message, input.catalog);
  if (budgetFiltered.length > 0) {
    return budgetFiltered.slice(0, input.limit);
  }

  const popular = orderProductsByIds(input.bestSellerIds, input.catalog);
  if (popular.length > 0) {
    return popular.slice(0, input.limit);
  }

  return input.catalog.slice(0, input.limit);
}

function selectOffersProducts(products: GroundedProduct[]): GroundedProduct[] {
  return [...products].sort((a, b) => a.price - b.price);
}

function scoreSearchMatches(
  query: string,
  products: GroundedProduct[],
): GroundedProduct[] {
  const matches = searchProductsForCart(query, products, {
    minScore: 0.42,
    limit: 8,
  });

  return matches.map((match) => match.product);
}

export function searchProductsForQuery(
  message: string,
  products: GroundedProduct[],
): GroundedProduct[] {
  const normalized = normalizeQuery(message).toLowerCase();
  let filtered = applyBudgetFilter(message, products);

  if (isOffersQuery(message)) {
    return selectOffersProducts(filtered);
  }

  if (/\bdairy\b/i.test(normalized)) {
    const dairyMatches = filtered.filter((product) =>
      /dairy/i.test(`${product.category} ${product.name_en}`),
    );
    if (dairyMatches.length > 0) return dairyMatches;
  }

  if (/\b(?:fruit|fruits)\b/i.test(normalized)) {
    const fruitMatches = filtered.filter((product) =>
      /fruit/i.test(`${product.category} ${product.name_en}`),
    );
    if (fruitMatches.length > 0) return fruitMatches;
  }

  if (/\b(?:vegetable|vegetables|veggies)\b/i.test(normalized)) {
    const vegMatches = filtered.filter((product) =>
      /vegetable/i.test(`${product.category} ${product.name_en}`),
    );
    if (vegMatches.length > 0) return vegMatches;
  }

  if (isHighProteinRecommendationRequest(normalized)) {
    const ranked = rankHighProteinProducts(filtered, 8);
    if (ranked.length > 0) return ranked;
  }

  if (/protein/i.test(normalized)) {
    const proteinMatches = filtered.filter((product) =>
      /protein|paneer|dal|rajma|bean|lentil|milk|yogurt|egg|broccoli|chicken|meat|fish/i.test(
        `${product.name_en} ${product.description ?? ""} ${product.category}`,
      ),
    );
    if (proteinMatches.length > 0) {
      return rankHighProteinProducts(proteinMatches, 8);
    }
  }

  if (/breakfast/i.test(normalized)) {
    const breakfastMatches = filtered.filter((product) =>
      /milk|banana|fruit|yogurt|bread/i.test(
        `${product.name_en} ${product.description ?? ""} ${product.category}`,
      ),
    );
    if (breakfastMatches.length > 0) return breakfastMatches;
  }

  if (/\b(?:bake|baking|cake|ingredients?\s+(?:for|to))\b/i.test(normalized)) {
    const bakingMatches = filtered.filter((product) =>
      /flour|sugar|egg|milk|butter|baking|yeast|vanilla|oil|cream/i.test(
        `${product.name_en} ${product.description ?? ""} ${product.category}`,
      ),
    );
    if (bakingMatches.length > 0) return bakingMatches;
  }

  if (/\b(?:cook|dinner|lunch|tonight|meal)\b/i.test(normalized)) {
    const mealMatches = filtered.filter((product) =>
      /dal|rice|paneer|vegetable|spice|oil|onion|potato|bread|milk|egg|chicken|broccoli/i.test(
        `${product.name_en} ${product.description ?? ""} ${product.category}`,
      ),
    );
    if (mealMatches.length > 0) {
      if (isHighProteinRecommendationRequest(normalized)) {
        return rankHighProteinProducts(mealMatches, 8);
      }
      return mealMatches;
    }
  }

  if (/\b(?:groceries|essentials|staples|pantry)\b/i.test(normalized)) {
    if (filtered.length > 0) return filtered.slice(0, 8);
  }

  if (/\b(?:snack|healthy)\b/i.test(normalized)) {
    const snackMatches = filtered.filter((product) =>
      /fruit|nut|yogurt|milk|banana|snack|biscuit|cookie|granola/i.test(
        `${product.name_en} ${product.description ?? ""} ${product.category}`,
      ),
    );
    if (snackMatches.length > 0) return snackMatches;
  }

  if (/gift/i.test(normalized)) {
    const giftMatches = filtered.filter((product) => product.price <= 1000);
    if (giftMatches.length > 0) return giftMatches;
  }

  const searchQuery = extractProductSearchQuery(message);
  if (searchQuery && searchQuery !== "__offers__") {
    const tokenMatches = scoreSearchMatches(searchQuery, filtered);
    if (tokenMatches.length > 0) return tokenMatches;
  }

  return [];
}

export function selectRecommendationProducts(input: {
  message: string;
  catalog: GroundedProduct[];
  bestSellerIds: string[];
  limit?: number;
}): GroundedProduct[] {
  const limit = input.limit ?? 4;
  const { message, catalog } = input;

  if (isPopularProductsQuery(message)) {
    const popular = orderProductsByIds(input.bestSellerIds, catalog);
    if (popular.length > 0) return popular.slice(0, limit);
    return catalog.slice(0, limit);
  }

  const matched = searchProductsForQuery(message, catalog);
  if (matched.length > 0) {
    if (isHighProteinRecommendationRequest(message)) {
      return rankHighProteinProducts(matched, limit);
    }
    return matched.slice(0, limit);
  }

  if (isOpenEndedRecommendation(message) && isHighProteinRecommendationRequest(message)) {
    const ranked = rankHighProteinProducts(applyBudgetFilter(message, catalog), limit);
    if (ranked.length > 0) return ranked;
  }

  if (isOpenEndedRecommendation(message)) {
    return selectCatalogFallbackProducts({
      message,
      catalog,
      bestSellerIds: input.bestSellerIds,
      limit,
    });
  }

  return [];
}

export function defaultRecommendationIntro(message: string): string {
  if (isPopularProductsQuery(message)) {
    return "Here are our current best-selling products:";
  }

  if (isOffersQuery(message)) {
    return "Here are today's offers from our catalog:";
  }

  if (/\b(?:do\s+(?:u|you)\s+have|have\s+(?:u|you)\s+got|got\s+any)\b/i.test(message)) {
    const query = extractProductSearchQuery(message);
    if (query && query !== "__offers__") {
      return `Here's what we have for "${query}":`;
    }
  }

  if (/\b(?:fruit|fruits)\b/i.test(message)) {
    return "Currently available fruits from our catalog:";
  }

  if (/\b(?:vegetable|vegetables|veggies)\b/i.test(message)) {
    return "Currently available vegetables from our catalog:";
  }

  if (/dairy/i.test(message)) {
    return "Here are dairy products from our live catalog:";
  }

  if (/protein/i.test(message)) {
    return "Here are protein-rich options from our menu:";
  }

  if (/\bweight[\s-]?loss\b/i.test(message)) {
    return "Here are some lighter meal ideas from our catalog:";
  }

  if (/\bhigh[\s-]?protein\b/i.test(message)) {
    return "Here are high-protein picks from our menu:";
  }

  if (/\brecommend|\bsuggest\b/i.test(message)) {
    return "Here are some recommendations based on your request:";
  }

  if (/\b(?:bake|baking|cake|ingredients?\s+(?:for|to))\b/i.test(message)) {
    return "Here are some ingredients from our catalog that could work:";
  }

  if (/\b(?:cook|dinner|lunch|tonight|meal)\b/i.test(message)) {
    return "Here are some ideas from our menu for tonight:";
  }

  if (/\b(?:groceries|essentials|staples|pantry)\b/i.test(message)) {
    return "Here are some grocery essentials from our catalog:";
  }

  if (/\b(?:snack|healthy)\b/i.test(message)) {
    return "Here are some snack options from our menu:";
  }

  if (/\bunder\s*[₹$]?\s*\d+/i.test(message)) {
    return "Here are some options within your budget:";
  }

  return "Here are some options from our menu that you might like:";
}
