import { COMMERCE_INTENTS, type OllamaAgentPayload } from "@/types/ai";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCartUpdate(value: unknown): value is { product_name: string; quantity: number } {
  if (!isRecord(value)) return false;
  return (
    typeof value.product_name === "string" &&
    value.product_name.trim().length > 0 &&
    typeof value.quantity === "number" &&
    Number.isInteger(value.quantity) &&
    value.quantity > 0
  );
}

export function parseAgentResponse(raw: string): OllamaAgentPayload | null {
  try {
    const parsed: unknown = JSON.parse(raw);

    if (!isRecord(parsed)) return null;
    if (typeof parsed.reply !== "string" || parsed.reply.trim().length === 0) {
      return null;
    }
    if (
      typeof parsed.intent !== "string" ||
      !COMMERCE_INTENTS.includes(parsed.intent as OllamaAgentPayload["intent"])
    ) {
      return null;
    }

    const intent = parsed.intent as OllamaAgentPayload["intent"];
    const reply = parsed.reply.trim();

    let cart_updates: OllamaAgentPayload["cart_updates"] = [];
    if (parsed.cart_updates !== undefined) {
      if (!Array.isArray(parsed.cart_updates)) return null;
      if (!parsed.cart_updates.every(isCartUpdate)) return null;
      cart_updates = parsed.cart_updates;
    }

    let recommended_product_ids: string[] = [];
    if (parsed.recommended_product_ids !== undefined) {
      if (!Array.isArray(parsed.recommended_product_ids)) return null;
      if (
        !parsed.recommended_product_ids.every(
          (id): id is string => typeof id === "string" && id.length > 0
        )
      ) {
        return null;
      }
      recommended_product_ids = parsed.recommended_product_ids;
    }

    if (intent === "add_to_cart" && cart_updates.length === 0) return null;
    if (intent === "view_cart" && cart_updates.length > 0) return null;
    if (intent === "recommendation" && recommended_product_ids.length === 0) {
      return null;
    }
    if (intent !== "add_to_cart" && cart_updates.length > 0) return null;
    if (intent !== "recommendation" && recommended_product_ids.length > 0) {
      return null;
    }

    return {
      intent,
      reply,
      cart_updates,
      recommended_product_ids,
    };
  } catch {
    return null;
  }
}
