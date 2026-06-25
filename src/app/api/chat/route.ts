import { runCommerceAgent } from "@/lib/ai/commerce-agent";
import type { ChatApiRequest } from "@/types/ai";
import type { CartSnapshot } from "@/types/cart";
import type { ChatMessage } from "@/types/chat";
import { NextResponse } from "next/server";

function isCartSnapshot(value: unknown): value is CartSnapshot {
  if (typeof value !== "object" || value === null) return false;
  const cart = value as CartSnapshot;
  return (
    Array.isArray(cart.items) &&
    typeof cart.itemCount === "number" &&
    typeof cart.subtotal === "number"
  );
}

function isChatMessage(value: unknown): value is ChatMessage {
  if (typeof value !== "object" || value === null) return false;
  const message = value as ChatMessage;
  return (
    typeof message.id === "string" &&
    (message.role === "customer" || message.role === "assistant") &&
    typeof message.content === "string" &&
    typeof message.createdAt === "string"
  );
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<ChatApiRequest>;

    if (typeof body.message !== "string" || body.message.trim().length === 0) {
      console.error("[ERROR] Chat API validation failed: message is required");
      return NextResponse.json({ error: "message is required" }, { status: 400 });
    }

    if (!isCartSnapshot(body.cartSnapshot)) {
      console.error("[ERROR] Chat API validation failed: cartSnapshot is required");
      return NextResponse.json(
        { error: "cartSnapshot is required" },
        { status: 400 }
      );
    }

    const recentMessages = Array.isArray(body.recentMessages)
      ? body.recentMessages.filter(isChatMessage).slice(-3)
      : [];

    const message = body.message.trim();

    console.log("[API] Received message:", {
      message,
      cartItemCount: body.cartSnapshot.itemCount,
      recentMessageCount: recentMessages.length,
    });

    const result = await runCommerceAgent({
      message,
      cartSnapshot: body.cartSnapshot,
      recentMessages,
    });

    console.log("[API] Agent result:", {
      source: result.source,
      intentReplyLength: result.reply.content.length,
      cartUpdateCount: result.cartUpdates?.length ?? 0,
      productIdCount: result.reply.productIds?.length ?? 0,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("[ERROR] Chat API failed:", error);
    return NextResponse.json(
      { error: "Failed to process chat message" },
      { status: 500 }
    );
  }
}
