import { mockProductMap, mockProducts } from "@/lib/mock/products";
import type { AgentCartUpdate, ResolvedCartUpdate } from "@/types/ai";

function normalizeName(name: string) {
  return name.trim().toLowerCase();
}

export function resolveProductByName(name: string): {
  id: string;
  name: string;
} | null {
  const normalized = normalizeName(name);
  if (!normalized) return null;

  const exact = mockProducts.find(
    (p) => normalizeName(p.name) === normalized
  );
  if (exact) return { id: exact.id, name: exact.name };

  const partial = mockProducts.find(
    (p) =>
      normalizeName(p.name).includes(normalized) ||
      normalized.includes(normalizeName(p.name))
  );
  if (partial) return { id: partial.id, name: partial.name };

  return null;
}

export function resolveCartUpdates(
  updates: AgentCartUpdate[]
): ResolvedCartUpdate[] {
  const resolved: ResolvedCartUpdate[] = [];

  for (const update of updates) {
    const product = resolveProductByName(update.product_name);
    if (!product) continue;

    const existing = resolved.find((item) => item.productId === product.id);
    if (existing) {
      existing.quantity += update.quantity;
    } else {
      resolved.push({
        productId: product.id,
        productName: product.name,
        quantity: update.quantity,
      });
    }
  }

  return resolved;
}

export function filterValidProductIds(ids: string[]): string[] {
  const seen = new Set<string>();
  const valid: string[] = [];

  for (const id of ids) {
    if (!mockProductMap[id] || seen.has(id)) continue;
    seen.add(id);
    valid.push(id);
  }

  return valid;
}
