import { formatCurrency } from "@/lib/format";
import type { GroundedProduct } from "@/lib/ai/product-grounding";

export const HIGH_PROTEIN_QUERY_PATTERNS = [
  /\bprotein\b/i,
  /\bgym\b/i,
  /\bmuscle[\s-]?gain\b/i,
  /\bbodybuilding\b/i,
  /\bpost[\s-]?workout\b/i,
  /\bhealthy\s+(?:lunch|dinner|meal|breakfast)\b/i,
  /\bhigh[\s-]?protein\b/i,
];

const LOW_PROTEIN_VEGETABLE_PATTERN =
  /\btomato|potato|onion|carrot|cucumber|cabbage\b/i;

export type ProteinTier =
  | "poultry_meat"
  | "dairy"
  | "eggs"
  | "protein_vegetable"
  | "other_vegetable"
  | "other";

const TIER_PRIORITY: ProteinTier[] = [
  "poultry_meat",
  "dairy",
  "eggs",
  "protein_vegetable",
  "other_vegetable",
  "other",
];

const TIER_REASONS: Record<ProteinTier, string> = {
  poultry_meat: "excellent protein source",
  dairy: "additional protein and calcium",
  eggs: "high-quality complete protein",
  protein_vegetable: "nutritious side dish with plant protein",
  other_vegetable: "fresh vegetable complement",
  other: "complements your meal",
};

function productText(product: GroundedProduct): string {
  return `${product.name_en} ${product.description ?? ""} ${product.category}`.toLowerCase();
}

export function isHighProteinRecommendationRequest(message: string): boolean {
  return HIGH_PROTEIN_QUERY_PATTERNS.some((pattern) => pattern.test(message));
}

export function classifyProteinTier(product: GroundedProduct): ProteinTier {
  const text = productText(product);

  if (/\bchicken|mutton|lamb|fish|prawn|shrimp|meat|turkey|poultry\b/.test(text)) {
    return "poultry_meat";
  }

  if (
    /\bdairy|milk|paneer|yogurt|yoghurt|curd|cheese|lassi|cottage\b/.test(text) ||
    /dairy/i.test(product.category)
  ) {
    return "dairy";
  }

  if (/\begg\b/.test(text)) {
    return "eggs";
  }

  if (/\bbroccoli|spinach|pea|bean|lentil|dal|rajma|soya|soy|tofu|quinoa\b/.test(text)) {
    return "protein_vegetable";
  }

  if (/vegetable|veggie/i.test(product.category) || /\bvegetable\b/.test(text)) {
    return "other_vegetable";
  }

  return "other";
}

function isLowProteinVegetable(product: GroundedProduct): boolean {
  return LOW_PROTEIN_VEGETABLE_PATTERN.test(productText(product));
}

function groupProductsByTier(products: GroundedProduct[]): Map<ProteinTier, GroundedProduct[]> {
  const groups = new Map<ProteinTier, GroundedProduct[]>(
    TIER_PRIORITY.map((tier) => [tier, []]),
  );

  for (const product of products) {
    const tier = classifyProteinTier(product);
    groups.get(tier)!.push(product);
  }

  return groups;
}

function hasStrongProteinPick(selected: GroundedProduct[]): boolean {
  return selected.some((product) => {
    const tier = classifyProteinTier(product);
    return tier === "poultry_meat" || tier === "dairy" || tier === "eggs";
  });
}

export function rankHighProteinProducts(
  products: GroundedProduct[],
  limit = 4,
): GroundedProduct[] {
  if (products.length === 0) return [];

  const byTier = groupProductsByTier(products);
  const selected: GroundedProduct[] = [];
  const seen = new Set<string>();

  const addProduct = (product: GroundedProduct) => {
    if (seen.has(product.id) || selected.length >= limit) return false;
    selected.push(product);
    seen.add(product.id);
    return true;
  };

  // One pick per tier in priority order — poultry first, then dairy, eggs, protein veg.
  for (const tier of TIER_PRIORITY) {
    if (selected.length >= limit) break;

    for (const product of byTier.get(tier) ?? []) {
      if (isLowProteinVegetable(product)) continue;
      if (addProduct(product)) break;
    }
  }

  // Fill remaining slots from high-value tiers before considering weak vegetables.
  if (selected.length < limit) {
    for (const tier of ["poultry_meat", "dairy", "eggs", "protein_vegetable"] as const) {
      if (selected.length >= limit) break;
      for (const product of byTier.get(tier) ?? []) {
        if (addProduct(product) && selected.length >= limit) break;
      }
    }
  }

  const strongProteinAvailable = hasStrongProteinPick(products);

  if (selected.length < limit) {
    for (const product of products) {
      if (seen.has(product.id)) continue;
      if (strongProteinAvailable && isLowProteinVegetable(product)) continue;
      addProduct(product);
      if (selected.length >= limit) break;
    }
  }

  return selected;
}

function emojiForProduct(product: GroundedProduct, tier: ProteinTier): string {
  const name = product.name_en.toLowerCase();

  if (/\bchicken\b/.test(name)) return "🍗";
  if (/\bmilk\b/.test(name)) return "🥛";
  if (/\bpaneer|cheese|yogurt|yoghurt|curd\b/.test(name)) return "🧀";
  if (/\begg\b/.test(name)) return "🥚";
  if (/\bbroccoli\b/.test(name)) return "🥦";
  if (/\bspinach\b/.test(name)) return "🥬";
  if (/\bfish\b/.test(name)) return "🐟";

  switch (tier) {
    case "poultry_meat":
      return "🍗";
    case "dairy":
      return "🥛";
    case "eggs":
      return "🥚";
    case "protein_vegetable":
      return "🥦";
    case "other_vegetable":
      return "🥬";
    default:
      return "🛒";
  }
}

export function buildHighProteinRecommendationIntro(
  products: GroundedProduct[],
): string {
  if (products.length === 0) {
    return "Here are protein-rich options from our menu:";
  }

  const lines = products.map((product) => {
    const tier = classifyProteinTier(product);
    const emoji = emojiForProduct(product, tier);
    const reason = TIER_REASONS[tier];
    return `${emoji} ${product.name_en} - ${reason}`;
  });

  const total = products.reduce((sum, product) => sum + product.price, 0);

  return [
    "For a high-protein meal, I recommend:",
    "",
    ...lines,
    "",
    `Estimated total: ${formatCurrency(total)}`,
  ].join("\n");
}
