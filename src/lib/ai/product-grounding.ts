import { normalizeQuery } from "@/lib/hinglish";
import { searchProductsForCart } from "@/lib/ai/product-search";
import { extractProductEntity } from "@/lib/ai/product-entity-extraction";
import { extractRequestedQuantity } from "@/lib/ai/cart-parser";
import type { Product } from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types";

export type GroundedProduct = Pick<
  Product,
  | "id"
  | "name_en"
  | "name_hi"
  | "price"
  | "stock"
  | "image_url"
  | "description"
  | "category"
>;

export async function fetchActiveProducts(
  supabase: SupabaseClient<Database>,
): Promise<GroundedProduct[]> {
  const { data, error } = await supabase
    .from("products")
    .select(
      "id, name_en, name_hi, price, stock, image_url, description, category",
    )
    .eq("active", true)
    .order("name_en", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    ...row,
    stock: Number(row.stock),
    price: Number(row.price),
  }));
}

export async function fetchInStockProducts(
  supabase: SupabaseClient<Database>,
): Promise<GroundedProduct[]> {
  const { data, error } = await supabase
    .from("products")
    .select(
      "id, name_en, name_hi, price, stock, image_url, description, category",
    )
    .eq("active", true)
    .gt("stock", 0);

  if (error) throw error;

  return (data ?? []).map((row) => ({
    ...row,
    stock: Number(row.stock),
    price: Number(row.price),
  }));
}

export function buildStockGroundedList(
  products: Pick<Product, "name_en" | "name_hi">[],
): string {
  if (products.length === 0) {
    return "Available Products:\n(none in stock today)";
  }

  const bullets = products.map((product) => `* ${product.name_en}`).join("\n");
  return `Available Products:\n\n${bullets}`;
}

export function matchProductsInText(
  text: string,
  products: GroundedProduct[],
): GroundedProduct[] {
  const { productQuery } = extractProductEntity(text);
  const query = productQuery || normalizeQuery(text);
  const matches = searchProductsForCart(query, products, { minScore: 0.55, limit: 5 });
  return matches.map((match) => match.product);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseQuantityForProduct(message: string, productName: string): number {
  const requested = extractRequestedQuantity(message);
  if (requested?.kind === "packs") return requested.packs;
  if (requested?.kind === "count") return requested.units;

  const nameLower = productName.toLowerCase();
  const patterns = [
    new RegExp(`(?:add|order|take|buy)\\s+(\\d+)\\s*(?:x\\s*)?${escapeRegex(nameLower)}`, "i"),
    new RegExp(`(\\d+)\\s*(?:x\\s*)?${escapeRegex(nameLower)}`, "i"),
    new RegExp(`${escapeRegex(nameLower)}\\s*[x×]\\s*(\\d+)`, "i"),
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match?.[1]) {
      const quantity = Number.parseInt(match[1], 10);
      if (quantity > 0) return quantity;
    }
  }

  return 1;
}

export function parseCartItemsFromMessage(
  message: string,
  products: GroundedProduct[],
): { product_id: string; quantity: number }[] {
  const normalized = normalizeQuery(message);
  const matched = matchProductsInText(normalized, products);

  return matched.map((product) => ({
    product_id: product.id,
    quantity: parseQuantityForProduct(normalized, product.name_en),
  }));
}

export const STOCK_GROUNDING_RULE = `ONLY mention products from this exact list. If asked for something not on this list, say it is not available today:`;

export const PRICE_INTEGRITY_RULE =
  "NEVER mention a specific price in your reply. Instead say '[product name] is available' and the UI will show the price automatically.";
