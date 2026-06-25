import type { GroundedProduct } from "@/lib/ai/product-grounding";

export function validateRecommendationIds(
  productIds: string[],
  catalog: GroundedProduct[],
): string[] {
  const validIds = new Set(catalog.map((product) => product.id));
  const seen = new Set<string>();
  const validated: string[] = [];

  for (const id of productIds) {
    if (!validIds.has(id) || seen.has(id)) continue;
    seen.add(id);
    validated.push(id);
  }

  return validated;
}

export function orderProductsByIds(
  productIds: string[],
  catalog: GroundedProduct[],
): GroundedProduct[] {
  const byId = new Map(catalog.map((product) => [product.id, product]));
  return productIds
    .map((id) => byId.get(id))
    .filter((product): product is GroundedProduct => Boolean(product));
}
