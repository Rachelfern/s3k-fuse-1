import { buildStockGroundedList } from "@/lib/ai/product-grounding";
import { groqChat, type GroqCallReason } from "@/lib/ai/groq-client";
import { isGroqEnabled } from "@/lib/ai/groq-config";
import type { GroundedProduct } from "@/lib/ai/product-grounding";

export type GroqCartLine = {
  product_id: string;
  quantity: number;
};

const CART_PARSE_PROMPT = `You parse natural-language grocery cart requests into structured JSON.
Products are selected ONLY from the provided catalog. Never invent product IDs.

Respond ONLY with valid JSON:
{ "items": [{ "product_id": string, "quantity": number }] }

If nothing matches, respond with:
{ "items": [] }`;

export async function parseCartWithGroq(input: {
  message: string;
  products: GroundedProduct[];
}): Promise<GroqCartLine[]> {
  if (!isGroqEnabled()) return [];

  const stockList = buildStockGroundedList(input.products);
  const system = `${CART_PARSE_PROMPT}\n\nCatalog:\n${stockList}`;

  try {
    const { content } = await groqChat({
      system,
      user: input.message,
      jsonMode: true,
      reason: "Cart parsing" satisfies GroqCallReason,
      message: input.message,
    });

    const parsed = JSON.parse(content) as { items?: GroqCartLine[] };
    const validIds = new Set(input.products.map((product) => product.id));

    return (parsed.items ?? [])
      .filter(
        (item) =>
          item.product_id &&
          validIds.has(item.product_id) &&
          Number.isFinite(item.quantity) &&
          item.quantity > 0,
      )
      .map((item) => ({
        product_id: item.product_id,
        quantity: Math.round(item.quantity),
      }));
  } catch {
    return [];
  }
}
