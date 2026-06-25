"use client";

import { useCallback } from "react";
import {
  buildFallbackAssistantContent,
  runFallbackResolver,
} from "@/lib/chat/fallback-resolver";
import { sanitizeAssistantResponse } from "@/lib/ai/response-validation";
import type { ChatAgentResult } from "@/types/ai";
import type { CartSnapshot } from "@/types/cart";
import type { ChatMessage } from "@/types/chat";

interface UseCommerceChatOptions {
  applyCartUpdates: (
    updates: NonNullable<ChatAgentResult["cartUpdates"]>
  ) => CartSnapshot;
}

async function fetchAgentReply(input: {
  message: string;
  cartSnapshot: CartSnapshot;
  recentMessages: ChatMessage[];
}): Promise<ChatAgentResult> {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(`Chat API failed with status ${response.status}`);
  }

  return (await response.json()) as ChatAgentResult;
}

export function useCommerceChat({ applyCartUpdates }: UseCommerceChatOptions) {
  const sendMessage = useCallback(
    async (input: {
      message: string;
      cartSnapshot: CartSnapshot;
      recentMessages: ChatMessage[];
    }): Promise<{
      assistantMessage: Omit<ChatMessage, "id" | "createdAt">;
      nextCartSnapshot: CartSnapshot;
    }> => {
      let result: ChatAgentResult;

      try {
        result = await fetchAgentReply(input);
      } catch {
        result = runFallbackResolver(input.message, input.cartSnapshot);
      }

      let nextCartSnapshot = input.cartSnapshot;

      if (result.cartUpdates && result.cartUpdates.length > 0) {
        nextCartSnapshot = applyCartUpdates(result.cartUpdates);
      }

      const content = sanitizeAssistantResponse(
        buildFallbackAssistantContent(result, nextCartSnapshot),
      );

      return {
        assistantMessage: {
          role: "assistant",
          content,
          productIds: result.reply.productIds,
        },
        nextCartSnapshot,
      };
    },
    [applyCartUpdates]
  );

  return { sendMessage };
}
