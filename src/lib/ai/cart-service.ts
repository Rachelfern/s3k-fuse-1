import { formatCurrency } from "@/lib/format";
import { catalogDebug } from "@/lib/ai/catalog-debug";
import {
  parseCartIntent,
  formatClarifyLabel,
  type ParsedCartLine,
} from "@/lib/ai/cart-parser";
import {
  defaultRecommendationIntro,
  fetchBestSellerProductIds,
  selectRecommendationProducts,
  validateRecommendationIds,
} from "@/lib/ai/product-catalog";
import { extractProductSearchQuery } from "@/lib/ai/product-query";
import { buildStoreAssistantRules } from "@/lib/ai/prompts/store-assistant";
import { sanitizeAssistantResponse } from "@/lib/ai/response-validation";
import { normalizeCommerceMessage } from "@/lib/hinglish";
import {
  buildStockGroundedList,
  fetchInStockProducts,
  PRICE_INTEGRITY_RULE,
  STOCK_GROUNDING_RULE,
} from "@/lib/ai/product-grounding";
import { groqChat, NO_MATCHING_PRODUCTS_MESSAGE } from "@/lib/ai/groq-client";
import { isGroqEnabled } from "@/lib/ai/groq-config";
import { parseCartWithGroq } from "@/lib/ai/groq-cart-parser";
import {
  parseRemoveRequest,
  findCartItemsForRemoval,
  logCartRemoveDebug,
  type CartLineForRemoval,
} from "@/lib/ai/cart-remove-parser";
import { isPopularProductsQuery } from "@/lib/ai/product-catalog";
import {
  buildHighProteinRecommendationIntro,
  isHighProteinRecommendationRequest,
} from "@/lib/ai/nutrition-recommendations";
import {
  classifyCustomerIntent,
  detectCommerceIntent,
  encodeCartConfirmIntent,
  encodeCartClarifyIntent,
  encodeRecommendationIntent,
  isBasketRecommendationRequest,
  isExplicitProductCartRequest,
  isRecommendationRequest,
  logCommerceIntent,
  parseCartConfirmMessage,
  parseCartPickMessage,
  type CustomerMessageIntent,
} from "@/lib/ai/message-intent";
import {
  fetchProductStockLevels,
  formatInsufficientStockMessage,
  validateStockLevels,
} from "@/lib/inventory/inventory-service";
import type { Product } from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types";

export { classifyCustomerIntent, encodeRecommendationIntent };
export type { CustomerMessageIntent };

const RECOMMENDATION_FORMAT_PROMPT = `${buildStoreAssistantRules([
  "You are a product recommendation assistant for an online grocery store.",
  "The products have ALREADY been selected from live inventory.",
  "Your job is ONLY to write intro and footer text in English.",
  "",
  STOCK_GROUNDING_RULE,
  "Selected products:",
  "{PRODUCTS_LIST}",
  "",
  "Rules:",
  "- NEVER invent product names, prices, categories, or availability",
  "- NEVER list products in intro/footer — product cards show them automatically",
  "- NEVER say items were added to cart",
  `- ${PRICE_INTEGRITY_RULE}`,
  '- intro: one warm English sentence introducing the recommendations',
  '- footer: exactly "Tap Add to Cart on any item you\'d like, or ask for more recommendations."',
  "",
  "Respond ONLY with valid JSON:",
  '{ "intro": string, "footer": string }',
])}`;

type RecommendationJson = {
  intro: string;
  footer: string;
};

export type CartItemResult = {
  product_id: string;
  name_en: string;
  quantity: number;
  price: number;
  line_total: number;
};

export type ParseCartSuccess = {
  success: true;
  items: CartItemResult[];
  cartTotal: number;
  cartId: string;
};

export type ParseCartNeedsClarification = {
  success: false;
  needsClarification: true;
  message: string;
  intent?: string;
  candidateProductIds?: string[];
};

export type ParseCartNeedsConfirmation = {
  success: false;
  needsConfirmation: true;
  message: string;
  intent: string;
  items: {
    product_id: string;
    name_en: string;
    quantity: number;
  }[];
};

export type ParseCartNotAnOrder = {
  success: false;
  notAnOrder: true;
};

export type RemoveCartItemResult = {
  product_id: string;
  name_en: string;
  quantity_removed: number;
  price: number;
};

export type RemoveCartSuccess = {
  success: true;
  action: "remove";
  removed: RemoveCartItemResult[];
  remaining: CartItemResult[];
  cartTotal: number;
  cartId: string;
};

export type RemoveCartResult =
  | RemoveCartSuccess
  | ParseCartNeedsClarification
  | ParseCartNotAnOrder;

export type ParseCartResult =
  | ParseCartSuccess
  | ParseCartNeedsClarification
  | ParseCartNeedsConfirmation
  | ParseCartNotAnOrder;

export type RecommendationSuccess = {
  success: true;
  intro: string;
  footer: string;
  productIds: string[];
  intent: string;
};

export type RecommendationFailure = {
  success: false;
};

export type RecommendationResult = RecommendationSuccess | RecommendationFailure;

export async function fetchActiveProducts(
  supabase: SupabaseClient<Database>,
): Promise<Pick<Product, "id" | "name_en" | "name_hi" | "price">[]> {
  return fetchInStockProducts(supabase);
}

export async function getProductCatalogDisplay(input: {
  supabase: SupabaseClient<Database>;
}): Promise<RecommendationResult> {
  const products = await fetchInStockProducts(input.supabase);
  if (products.length === 0) {
    return { success: false };
  }

  const limit = Math.min(products.length, 8);
  const productIds = validateRecommendationIds(
    products.slice(0, limit).map((product) => product.id),
    products,
  );

  if (productIds.length === 0) {
    return { success: false };
  }

  catalogDebug("catalog_products", productIds);

  return {
    success: true,
    intro: "Here's our current product catalog:",
    footer:
      "Tap Add to Cart on any item you'd like, or open Browse Products for the full catalog with search and categories.",
    productIds,
    intent: encodeRecommendationIntent(productIds),
  };
}

export async function getProductRecommendations(input: {
  supabase: SupabaseClient<Database>;
  message: string;
  allowGroq?: boolean;
}): Promise<RecommendationResult> {
  const products = await fetchInStockProducts(input.supabase);
  if (products.length === 0) {
    return { success: false };
  }

  const normalizedMessage = normalizeCommerceMessage(input.message);
  const extractedQuery = extractProductSearchQuery(input.message);
  const bestSellerIds = await fetchBestSellerProductIds(input.supabase, 4);
  const selectedProducts = selectRecommendationProducts({
    message: normalizedMessage,
    catalog: products,
    bestSellerIds,
    limit: 4,
  });

  const productIds = validateRecommendationIds(
    selectedProducts.map((product) => product.id),
    products,
  );

  console.log("[PRODUCT_SEARCH]", {
    detectedIntent: "product_recommendation",
    extractedQuery,
    normalizedQuery: normalizedMessage,
    productsReturned: productIds.length,
    productIds,
  });

  if (productIds.length === 0) {
    return { success: false };
  }

  catalogDebug("customer_query", {
    query: normalizedMessage,
    extractedQuery,
  });
  catalogDebug(
    "recommended_products",
    productIds.map((id) => {
      const product = products.find((row) => row.id === id);
      return { id, name: product?.name_en ?? "unknown" };
    }),
  );

  let intro = defaultRecommendationIntro(normalizedMessage);
  let footer =
    "Tap Add to Cart on any item you'd like, or ask for more recommendations.";

  if (isHighProteinRecommendationRequest(normalizedMessage)) {
    intro = buildHighProteinRecommendationIntro(selectedProducts);
  }

  const skipGroq =
    input.allowGroq === false ||
    isPopularProductsQuery(normalizedMessage) ||
    isHighProteinRecommendationRequest(normalizedMessage) ||
    !isGroqEnabled();

  if (!skipGroq) {
    const stockList = buildStockGroundedList(
      selectedProducts.filter((product) => productIds.includes(product.id)),
    );
    const systemPrompt = RECOMMENDATION_FORMAT_PROMPT.replace(
      "{PRODUCTS_LIST}",
      stockList,
    );

    try {
      const { content: raw } = await groqChat({
        system: systemPrompt,
        user: normalizedMessage,
        jsonMode: true,
        reason: "Recommendation",
        message: normalizedMessage,
      });
      const parsed = JSON.parse(raw) as RecommendationJson;
      const candidateIntro = parsed.intro?.trim();
      const candidateFooter = parsed.footer?.trim();

      if (candidateIntro) {
        intro = sanitizeAssistantResponse(candidateIntro);
        if (intro.includes("Sorry, I couldn't understand")) {
          intro = defaultRecommendationIntro(normalizedMessage);
        }
      }

      if (candidateFooter) {
        const validatedFooter = sanitizeAssistantResponse(candidateFooter);
        if (!validatedFooter.includes("Sorry, I couldn't understand")) {
          footer = validatedFooter;
        }
      }
    } catch {
      // Keep deterministic intro/footer from catalog selection when Groq fails.
    }
  }

  return {
    success: true,
    intro,
    footer,
    productIds,
    intent: encodeRecommendationIntent(productIds),
  };
}

export async function parseCustomerCartRemove(input: {
  supabase: SupabaseClient<Database>;
  message: string;
  customerId: string;
  conversationId: string;
}): Promise<RemoveCartResult> {
  if (detectCommerceIntent(input.message) !== "CART_REMOVE") {
    return { success: false, notAnOrder: true };
  }

  const normalizedMessage = normalizeCommerceMessage(input.message);
  const removeRequest = parseRemoveRequest(normalizedMessage);

  if (!removeRequest) {
    return {
      success: false,
      needsClarification: true,
      message: "Which item would you like me to remove from your cart?",
    };
  }

  const { data: existingCart, error: cartLookupError } = await input.supabase
    .from("carts")
    .select("id")
    .eq("customer_id", input.customerId)
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (cartLookupError) throw cartLookupError;

  if (!existingCart?.id) {
    return {
      success: false,
      needsClarification: true,
      message: "Your cart is empty — there's nothing to remove.",
    };
  }

  const { data: cartRows, error: itemsError } = await input.supabase
    .from("cart_items")
    .select("id, product_id, quantity, price_snapshot, products ( name_en )")
    .eq("cart_id", existingCart.id);

  if (itemsError) throw itemsError;

  const cartLines: CartLineForRemoval[] = (cartRows ?? [])
    .filter((row) => row.product_id)
    .map((row) => ({
      cartItemId: row.id,
      product_id: row.product_id ?? "",
      name_en:
        (row.products as { name_en: string } | null)?.name_en ?? "Item",
      quantity: row.quantity,
      price: Number(row.price_snapshot),
    }));

  const cartBefore = cartLines.map((line) => ({
    name: line.name_en,
    quantity: line.quantity,
  }));

  if (cartLines.length === 0) {
    return {
      success: false,
      needsClarification: true,
      message: "Your cart is empty — there's nothing to remove.",
    };
  }

  const matchedLines = findCartItemsForRemoval(
    removeRequest.productQuery,
    cartLines,
  );

  if (matchedLines.length === 0) {
    const products = await fetchInStockProducts(input.supabase);
    const catalogMatch = findCartItemsForRemoval(
      removeRequest.productQuery,
      products.map((product) => ({
        cartItemId: "",
        product_id: product.id,
        name_en: product.name_en,
        quantity: 0,
        price: product.price,
      })),
    );

    if (catalogMatch.length > 0) {
      return {
        success: false,
        needsClarification: true,
        message: `I couldn't find ${removeRequest.productQuery} in your cart. Tap View Cart to see what's inside.`,
      };
    }

    return {
      success: false,
      needsClarification: true,
      message: `I couldn't find "${removeRequest.productQuery}" in your cart. Could you try again?`,
    };
  }

  if (matchedLines.length > 1 && removeRequest.quantity.mode === "partial") {
    const candidates = matchedLines.map((line) => ({
      productId: line.product_id,
      label: line.name_en,
    }));

    return {
      success: false,
      needsClarification: true,
      message: "Which item would you like me to remove?",
      intent: encodeCartClarifyIntent(candidates),
      candidateProductIds: candidates.map((candidate) => candidate.productId),
    };
  }

  const removed: RemoveCartItemResult[] = [];

  for (const line of matchedLines) {
    let quantityRemoved = line.quantity;

    if (removeRequest.quantity.mode === "partial") {
      quantityRemoved = Math.min(line.quantity, removeRequest.quantity.amount);
    }

    const nextQuantity = line.quantity - quantityRemoved;

    if (nextQuantity <= 0) {
      const { error: deleteError } = await input.supabase
        .from("cart_items")
        .delete()
        .eq("id", line.cartItemId);

      if (deleteError) throw deleteError;
    } else {
      const { error: updateError } = await input.supabase
        .from("cart_items")
        .update({ quantity: nextQuantity })
        .eq("id", line.cartItemId);

      if (updateError) throw updateError;
    }

    removed.push({
      product_id: line.product_id,
      name_en: line.name_en,
      quantity_removed: quantityRemoved,
      price: line.price,
    });
  }

  const { data: remainingItems, error: totalError } = await input.supabase
    .from("cart_items")
    .select("product_id, quantity, price_snapshot, products ( name_en )")
    .eq("cart_id", existingCart.id);

  if (totalError) throw totalError;

  const cartTotal = (remainingItems ?? []).reduce(
    (sum, row) => sum + row.quantity * row.price_snapshot,
    0,
  );

  const cartAfter = (remainingItems ?? []).map((row) => ({
    name: (row.products as { name_en: string } | null)?.name_en ?? "Item",
    quantity: row.quantity,
  }));

  const remaining: CartItemResult[] = (remainingItems ?? [])
    .filter((row) => row.product_id)
    .map((row) => ({
      product_id: row.product_id ?? "",
      name_en: (row.products as { name_en: string } | null)?.name_en ?? "Item",
      quantity: row.quantity,
      price: Number(row.price_snapshot),
      line_total: row.quantity * Number(row.price_snapshot),
    }));

  const matchedProduct = removed.map((item) => item.name_en).join(", ") || null;

  logCartRemoveDebug({
    message: normalizedMessage,
    detectedIntent: "CART_REMOVE",
    matchedProduct,
    cartBefore,
    cartAfter,
    removeSpec: removeRequest.quantity,
  });

  logCommerceIntent({
    message: normalizedMessage,
    detectedIntent: "CART_REMOVE",
    matchedProduct,
    actionExecuted: "remove",
  });

  return {
    success: true,
    action: "remove",
    removed,
    remaining,
    cartTotal,
    cartId: existingCart.id,
  };
}

export async function parseCustomerCart(input: {
  supabase: SupabaseClient<Database>;
  message: string;
  customerId: string;
  conversationId: string;
}): Promise<ParseCartResult> {
  if (detectCommerceIntent(input.message) !== "CART_ADD") {
    return { success: false, notAnOrder: true };
  }

  const products = await fetchInStockProducts(input.supabase);
  const normalizedMessage = normalizeCommerceMessage(input.message);

  const confirmItems = parseCartConfirmMessage(normalizedMessage);
  if (confirmItems) {
    return applyCartLines({
      supabase: input.supabase,
      customerId: input.customerId,
      conversationId: input.conversationId,
      lines: confirmItems
        .map((item) => {
          const product = products.find((row) => row.id === item.productId);
          if (!product) return null;
          return { product, quantity: item.quantity };
        })
        .filter((line): line is { product: (typeof products)[number]; quantity: number } =>
          Boolean(line),
        ),
    });
  }

  const pickedProductId = parseCartPickMessage(normalizedMessage);
  if (pickedProductId) {
    const product = products.find((row) => row.id === pickedProductId);
    if (!product) {
      return {
        success: false,
        needsClarification: true,
        message: "I couldn't find that product anymore. Could you try again?",
      };
    }

    return applyCartLines({
      supabase: input.supabase,
      customerId: input.customerId,
      conversationId: input.conversationId,
      lines: [{ product, quantity: 1 }],
    });
  }

  const parsedIntent = parseCartIntent(normalizedMessage, products);

  if (parsedIntent.status === "no_match") {
    const groqLines = await parseCartWithGroq({
      message: normalizedMessage,
      products,
    });

    if (groqLines.length > 0) {
      return applyCartLines({
        supabase: input.supabase,
        customerId: input.customerId,
        conversationId: input.conversationId,
        lines: groqLines
          .map((line) => {
            const product = products.find((row) => row.id === line.product_id);
            if (!product) return null;
            return { product, quantity: line.quantity };
          })
          .filter(
            (line): line is { product: (typeof products)[number]; quantity: number } =>
              Boolean(line),
          ),
      });
    }

    if (isExplicitProductCartRequest(normalizedMessage)) {
      if (
        isRecommendationRequest(normalizedMessage) ||
        isBasketRecommendationRequest(normalizedMessage)
      ) {
        return { success: false, notAnOrder: true };
      }

      return {
        success: false,
        needsClarification: true,
        message: NO_MATCHING_PRODUCTS_MESSAGE,
      };
    }

    return { success: false, notAnOrder: true };
  }

  if (parsedIntent.status === "ambiguous") {
    const candidates = parsedIntent.candidates.map((product) => ({
      productId: product.id,
      label: formatClarifyLabel(product.name_en),
    }));

    return {
      success: false,
      needsClarification: true,
      message: parsedIntent.message,
      intent: encodeCartClarifyIntent(candidates),
      candidateProductIds: candidates.map((candidate) => candidate.productId),
    };
  }

  if (parsedIntent.status === "confirm") {
    return {
      success: false,
      needsConfirmation: true,
      message: parsedIntent.message,
      intent: encodeCartConfirmIntent(
        parsedIntent.lines.map((line) => ({
          productId: line.product.id,
          quantity: line.quantity,
        })),
      ),
      items: parsedIntent.lines.map((line) => ({
        product_id: line.product.id,
        name_en: line.product.name_en,
        quantity: line.quantity,
      })),
    };
  }

  return applyCartLines({
    supabase: input.supabase,
    customerId: input.customerId,
    conversationId: input.conversationId,
    lines: parsedIntent.lines.map((line) => ({
      product: line.product,
      quantity: line.quantity,
    })),
  });
}

async function applyCartLines(input: {
  supabase: SupabaseClient<Database>;
  customerId: string;
  conversationId: string;
  lines: { product: ParsedCartLine["product"]; quantity: number }[];
}): Promise<ParseCartResult> {
  const validItems = input.lines.filter((line) => line.quantity > 0);

  if (validItems.length === 0) {
    return {
      success: false,
      needsClarification: true,
      message: NO_MATCHING_PRODUCTS_MESSAGE,
    };
  }

  const productById = new Map(
    validItems.map((line) => [line.product.id, line.product]),
  );

  const { data: existingCart, error: cartLookupError } = await input.supabase
    .from("carts")
    .select("id")
    .eq("customer_id", input.customerId)
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (cartLookupError) throw cartLookupError;

  let cartId = existingCart?.id;

  if (!cartId) {
    const { data: newCart, error: cartInsertError } = await input.supabase
      .from("carts")
      .insert({
        customer_id: input.customerId,
        conversation_id: input.conversationId,
        status: "active",
      })
      .select("id")
      .single();

    if (cartInsertError) throw cartInsertError;
    cartId = newCart.id;
  } else if (input.conversationId) {
    await input.supabase
      .from("carts")
      .update({ conversation_id: input.conversationId })
      .eq("id", cartId);
  }

  const { data: existingItems, error: itemsLookupError } = await input.supabase
    .from("cart_items")
    .select("id, product_id, quantity, price_snapshot")
    .eq("cart_id", cartId);

  if (itemsLookupError) throw itemsLookupError;

  const existingByProduct = new Map(
    (existingItems ?? []).map((item) => [item.product_id, item]),
  );

  const stockByProduct = await fetchProductStockLevels(
    input.supabase,
    validItems.map((line) => line.product.id),
  );

  const requestedItems = validItems.map((line) => {
    const existing = existingByProduct.get(line.product.id);
    return {
      productId: line.product.id,
      quantity: (existing?.quantity ?? 0) + line.quantity,
    };
  });

  const stockIssues = validateStockLevels(requestedItems, stockByProduct);
  if (stockIssues.length > 0) {
    return {
      success: false,
      needsClarification: true,
      message: formatInsufficientStockMessage(stockIssues),
    };
  }

  const resultItems: CartItemResult[] = [];

  for (const item of validItems) {
    const product = productById.get(item.product.id)!;
    const existing = existingByProduct.get(item.product.id);

    if (existing) {
      const nextQuantity = existing.quantity + item.quantity;
      const { error: updateError } = await input.supabase
        .from("cart_items")
        .update({ quantity: nextQuantity, price_snapshot: product.price })
        .eq("id", existing.id);

      if (updateError) throw updateError;

      resultItems.push({
        product_id: item.product.id,
        name_en: product.name_en,
        quantity: item.quantity,
        price: product.price,
        line_total: product.price * item.quantity,
      });
    } else {
      const { error: insertError } = await input.supabase.from("cart_items").insert({
        cart_id: cartId,
        product_id: item.product.id,
        quantity: item.quantity,
        price_snapshot: product.price,
      });

      if (insertError) throw insertError;

      resultItems.push({
        product_id: item.product.id,
        name_en: product.name_en,
        quantity: item.quantity,
        price: product.price,
        line_total: product.price * item.quantity,
      });
    }
  }

  const { data: allCartItems, error: totalError } = await input.supabase
    .from("cart_items")
    .select("quantity, price_snapshot")
    .eq("cart_id", cartId);

  if (totalError) throw totalError;

  const cartTotal = (allCartItems ?? []).reduce(
    (sum, row) => sum + row.quantity * row.price_snapshot,
    0,
  );

  return {
    success: true,
    items: resultItems,
    cartTotal,
    cartId,
  };
}

export function formatCartRemoveMessage(
  removed: RemoveCartItemResult[],
  cartTotal: number,
): string {
  const names = removed.map((item) => item.name_en).join(", ");
  return `Removed ${names} from your cart.\n\nRemaining total: ${formatCurrency(cartTotal)}\n\nTap View Cart below to review your cart.`;
}

export function formatCartSystemMessage(items: CartItemResult[], cartTotal: number): string {
  const lines = items.map((item) => {
    const packLabel = item.quantity === 1 ? "pack" : "packs";
    return `✓ Added ${item.quantity} ${packLabel} of ${item.name_en}`;
  });
  return `${lines.join("\n")}\n\nCart Total: ₹${cartTotal.toFixed(0)}`;
}

export { matchProductsInText, fetchInStockProducts } from "@/lib/ai/product-grounding";
