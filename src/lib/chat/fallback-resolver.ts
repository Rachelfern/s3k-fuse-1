import {
  buildProductAddedMessage,
  resolveAssistantReply,
} from "@/lib/mock/chat-responses";
import type { ChatAgentResult } from "@/types/ai";
import type { CartSnapshot } from "@/types/cart";

export function runFallbackResolver(
  message: string,
  cartSnapshot: CartSnapshot
): ChatAgentResult {
  const result = resolveAssistantReply(message, cartSnapshot);

  const cartUpdates =
    result.cartMutation?.type === "add"
      ? [
          {
            productId: result.cartMutation.productId,
            productName: result.addedProductName ?? "Item",
            quantity: 1,
          },
        ]
      : undefined;

  return {
    source: "fallback",
    reply: {
      role: "assistant",
      content: result.reply.content,
      productIds: result.reply.productIds,
    },
    cartUpdates,
  };
}

export function buildFallbackAssistantContent(
  result: ChatAgentResult,
  nextCartSnapshot: CartSnapshot
): string {
  if (
    result.source === "fallback" &&
    result.cartUpdates?.length === 1 &&
    !result.reply.content.trim()
  ) {
    return buildProductAddedMessage(
      result.cartUpdates[0].productName,
      nextCartSnapshot
    );
  }

  return result.reply.content;
}
