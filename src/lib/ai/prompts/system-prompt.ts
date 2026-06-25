import { mockBusiness } from "@/lib/mock/business";
import { mockProducts } from "@/lib/mock/products";
import { buildStoreAssistantRules } from "@/lib/ai/prompts/store-assistant";
import type { CartSnapshot } from "@/types/cart";
import type { ChatMessage } from "@/types/chat";

function formatCatalogForPrompt() {
  return mockProducts.map((p) => ({
    id: p.id,
    name: p.name,
    price_inr: p.price,
    description: p.description,
  }));
}

function formatCartForPrompt(cart: CartSnapshot) {
  if (cart.itemCount === 0) {
    return { item_count: 0, items: [], subtotal_inr: 0 };
  }

  return {
    item_count: cart.itemCount,
    subtotal_inr: cart.subtotal,
    items: cart.items.map((item) => ({
      product_id: item.productId,
      name: item.product.name,
      quantity: item.quantity,
      line_subtotal_inr: item.lineSubtotal,
    })),
  };
}

function formatHistoryForPrompt(messages: ChatMessage[]) {
  return messages.slice(-3).map((m) => ({
    role: m.role,
    content: m.content,
  }));
}

export function buildCommerceAgentPrompt(input: {
  message: string;
  cartSnapshot: CartSnapshot;
  recentMessages: ChatMessage[];
}): string {
  const catalog = formatCatalogForPrompt();
  const cart = formatCartForPrompt(input.cartSnapshot);
  const history = formatHistoryForPrompt(input.recentMessages);

  return `${buildStoreAssistantRules([
    `You are ${mockBusiness.name}, a WhatsApp-style food ordering assistant.`,
    "Respond with valid JSON only. No markdown fences, no commentary outside JSON.",
    "",
    "SUPPORTED INTENTS (use exactly one):",
    '- "add_to_cart" — user wants to add item(s) with quantities to the cart',
    '- "view_cart" — user asks to see or summarize their current cart',
    '- "recommendation" — user asks for meal suggestions (budget, vegetarian, combo, protein, etc.)',
    "",
    "PRODUCT CATALOG:",
    JSON.stringify(catalog, null, 2),
    "",
    "CURRENT CART:",
    JSON.stringify(cart, null, 2),
    "",
    "RECENT CONVERSATION (last 3 messages):",
    JSON.stringify(history, null, 2),
    "",
    "CURRENT USER MESSAGE:",
    JSON.stringify(input.message),
    "",
    "OUTPUT JSON SCHEMA:",
    `{ "intent": "add_to_cart" | "view_cart" | "recommendation", "reply": "natural language reply in English", "cart_updates": [{ "product_name": "exact catalog name", "quantity": positive integer }], "recommended_product_ids": ["catalog id strings"] }`,
    "",
    "RULES:",
    "1. add_to_cart: Fill cart_updates with one entry per product using exact catalog names. reply confirms what was added. recommended_product_ids must be [].",
    "2. view_cart: cart_updates must be []. reply lists each cart line with quantity and subtotal in INR (₹). recommended_product_ids must be [].",
    "3. recommendation: cart_updates must be []. reply briefly explains why these items fit. recommended_product_ids must contain 2–4 valid catalog id strings only. Do not invent product ids.",
    "4. All quantities must be positive integers.",
    "5. Use ₹ for prices in reply text.",
    "6. reply must always be in English.",
  ])}`;
}
