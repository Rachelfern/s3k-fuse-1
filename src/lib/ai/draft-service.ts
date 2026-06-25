import {
  buildContextAwareFallbackReply,
  fetchConversationMemory,
  formatConversationMemoryForPrompt,
  rejectsExistingOrderContext,
  type ConversationMemory,
} from "@/lib/ai/conversation-context";
import {
  fetchActiveProducts,
  PRICE_INTEGRITY_RULE,
  STOCK_GROUNDING_RULE,
  type GroundedProduct,
} from "@/lib/ai/product-grounding";
import { buildStoreAssistantRules } from "@/lib/ai/prompts/store-assistant";
import { sanitizeAssistantResponse } from "@/lib/ai/response-validation";
import { normalizeQuery } from "@/lib/hinglish";
import {
  groqChatWithRetry,
  GROQ_CONVERSATIONAL_FALLBACK,
  GROQ_UNAVAILABLE_MESSAGE,
} from "@/lib/ai/groq-client";
import { isGroqEnabled } from "@/lib/ai/groq-config";
import type { Database } from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";

export type DraftContextUsed = {
  orderCount: number;
  cartTotal: number;
  customerName: string;
  latestOrderSummary: string | null;
  cartSummary: string | null;
  businessName: string;
  messageCount: number;
  hasActiveOrder: boolean;
};

export type GenerateDraftResult = {
  draft: string;
  contextUsed: DraftContextUsed;
};

function buildActiveProductList(products: GroundedProduct[]): string {
  if (products.length === 0) {
    return "Active Products:\n(none listed)";
  }

  const bullets = products
    .map(
      (product) =>
        `* ${product.name_en} / ${product.name_hi} — ₹${product.price} [${product.id}]`,
    )
    .join("\n");

  return `Active Products:\n\n${bullets}`;
}

function formatCartSummary(
  items: { quantity: number; products: { name_en: string } | null }[],
): string {
  if (items.length === 0) return "empty";

  const total = items.reduce((sum, item) => sum + item.quantity, 0);
  const names = items
    .map((item) => `${item.quantity}x ${item.products?.name_en ?? "item"}`)
    .join(", ");

  return `${names} (${total} items)`;
}

function buildConversationalSystemPrompt(input: {
  businessName: string;
  firstName: string;
  orderCount: number;
  totalSpent: number;
  cartSummary: string;
  memoryBlock: string;
  productList: string;
}): string {
  return `${buildStoreAssistantRules([
    `You are the customer support assistant for ${input.businessName}, an online grocery store.`,
    "Write a short, helpful reply to the customer's latest message.",
    "",
    "Customer profile:",
    `- Name: ${input.firstName}`,
    `- Total orders: ${input.orderCount} (lifetime value ₹${input.totalSpent})`,
    `- Active cart: ${input.cartSummary}`,
    "",
    input.memoryBlock,
    "",
    STOCK_GROUNDING_RULE,
    input.productList,
    "",
    "Conversation rules:",
    "- Read the Recent Conversation and Pending Action Context before replying.",
    "- Short replies like 'ok tomorrow' or 'I'm free then' refer to the most recent system notification or assistant message.",
    "- NEVER say you have no order information when Active Order or Recent Orders are present below.",
    "- When COD collection failed, acknowledge delivery availability and confirm the team will reschedule.",
    "- Reference the specific order ID, payment status, and shipment status from context when relevant.",
    "",
    "Reply rules:",
    "- 1-3 sentences ONLY. Never longer.",
    "- Be warm and personal; use the customer's first name when natural.",
    `- ${PRICE_INTEGRITY_RULE}`,
    "- Never make up stock or delivery ETAs you don't know.",
    "- Never say items were added to cart — you cannot modify the cart.",
    "- Never tell the customer to visit a page, dashboard, orders section, or any screen outside chat.",
    "- All actions happen in this conversation via messages and quick reply buttons.",
    "- For product browsing, suggest they tap Browse Products or Best Sellers below.",
    "- Do not start with 'Hello' or 'Hi'.",
  ])}`;
}

function finalizeDraft(
  draft: string,
  memory: ConversationMemory,
  customerMessage: string,
): string {
  const sanitized = sanitizeAssistantResponse(draft.trim());
  if (rejectsExistingOrderContext(sanitized, memory)) {
    return buildContextAwareFallbackReply(memory, customerMessage);
  }
  return sanitized;
}

export async function generateReplyDraft(input: {
  supabase: SupabaseClient<Database>;
  conversationId: string;
  customerMessage: string;
  customerId: string;
  useGroq?: boolean;
  memory?: ConversationMemory;
}): Promise<GenerateDraftResult> {
  const [customerResult, cartResult, businessResult, memory] = await Promise.all([
    input.supabase
      .from("customers")
      .select("name, order_count, total_spent, business_id")
      .eq("id", input.customerId)
      .maybeSingle(),
    input.supabase
      .from("carts")
      .select("id")
      .eq("customer_id", input.customerId)
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    input.supabase.from("businesses").select("name").limit(1).maybeSingle(),
    input.memory ??
      fetchConversationMemory(input.supabase, {
        conversationId: input.conversationId,
        customerId: input.customerId,
      }),
  ]);

  if (customerResult.error) throw customerResult.error;
  if (cartResult.error) throw cartResult.error;
  if (businessResult.error) throw businessResult.error;

  const customer = customerResult.data;
  const businessName = businessResult.data?.name ?? "S3K Commerce";
  const customerName = customer?.name?.trim() || "there";
  const firstName = customerName.split(/\s+/)[0] ?? customerName;

  let cartSummary = "empty";
  let cartTotal = 0;

  if (cartResult.data?.id) {
    const { data: cartItems, error: cartItemsError } = await input.supabase
      .from("cart_items")
      .select("quantity, price_snapshot, products ( name_en )")
      .eq("cart_id", cartResult.data.id);

    if (cartItemsError) throw cartItemsError;

    cartTotal = (cartItems ?? []).reduce(
      (sum, item) => sum + item.quantity * item.price_snapshot,
      0,
    );
    cartSummary =
      (cartItems ?? []).length > 0
        ? formatCartSummary(
            cartItems as { quantity: number; products: { name_en: string } | null }[],
          )
        : "empty";
  }

  const activeProducts = await fetchActiveProducts(input.supabase);
  const productList = buildActiveProductList(activeProducts);
  const memoryBlock = formatConversationMemoryForPrompt(memory);
  const latestOrder = memory.activeOrder ?? memory.recentOrders[0] ?? null;
  const latestOrderSummary = latestOrder
    ? `${latestOrder.id} (${latestOrder.status}) — ₹${latestOrder.total_amount}`
    : null;

  const systemPrompt = buildConversationalSystemPrompt({
    businessName,
    firstName,
    orderCount: customer?.order_count ?? 0,
    totalSpent: Number(customer?.total_spent ?? 0),
    cartSummary,
    memoryBlock,
    productList,
  });

  const normalizedMessage = normalizeQuery(input.customerMessage);
  const userPrompt = `${memoryBlock}

Latest customer message: "${normalizedMessage}"

Reply using the conversation and order context above.`;

  let draft: string;
  const shouldUseGroq = input.useGroq === true && isGroqEnabled();

  if (shouldUseGroq) {
    try {
      const { content: raw } = await groqChatWithRetry({
        system: systemPrompt,
        user: userPrompt,
        reason: "Conversational assistance",
        message: normalizedMessage,
      });
      draft = finalizeDraft(raw, memory, normalizedMessage);
    } catch {
      draft = memory.hasActiveOrder
        ? buildContextAwareFallbackReply(memory, normalizedMessage)
        : GROQ_UNAVAILABLE_MESSAGE;
    }
  } else {
    draft = memory.hasActiveOrder
      ? buildContextAwareFallbackReply(memory, normalizedMessage)
      : GROQ_CONVERSATIONAL_FALLBACK;
  }

  return {
    draft,
    contextUsed: {
      orderCount: customer?.order_count ?? 0,
      cartTotal,
      customerName: firstName,
      latestOrderSummary,
      cartSummary: cartSummary === "empty" ? null : cartSummary,
      businessName,
      messageCount: memory.recentMessages.length,
      hasActiveOrder: memory.hasActiveOrder,
    },
  };
}
