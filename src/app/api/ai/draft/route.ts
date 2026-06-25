import { generateReplyDraft } from "@/lib/ai/draft-service";
import { createServiceClient } from "@/lib/supabase/service-client";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      conversationId?: string;
      conversation_id?: string;
      customerMessage?: string;
      customerId?: string;
      customer_id?: string;
    };

    const conversationId = body.conversationId ?? body.conversation_id;
    const customerId = body.customerId ?? body.customer_id;

    if (!conversationId) {
      return NextResponse.json(
        { error: "conversationId is required" },
        { status: 400 },
      );
    }

    const supabase = createServiceClient();
    let customerMessage = body.customerMessage?.trim();
    let resolvedCustomerId = customerId;

    if (!customerMessage || !resolvedCustomerId) {
      const { data: conversation, error: conversationError } = await supabase
        .from("conversations")
        .select("customer_id")
        .eq("id", conversationId)
        .maybeSingle();

      if (conversationError) throw conversationError;

      resolvedCustomerId = resolvedCustomerId ?? conversation?.customer_id ?? undefined;

      if (!customerMessage) {
        const { data: latestMessage, error: messageError } = await supabase
          .from("messages")
          .select("content")
          .eq("conversation_id", conversationId)
          .eq("sender_type", "customer")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (messageError) throw messageError;
        customerMessage = latestMessage?.content?.trim();
      }
    }

    if (!resolvedCustomerId) {
      return NextResponse.json(
        { error: "customerId is required" },
        { status: 400 },
      );
    }

    if (!customerMessage) {
      return NextResponse.json(
        { error: "customerMessage is required" },
        { status: 400 },
      );
    }

    const result = await generateReplyDraft({
      supabase,
      conversationId,
      customerMessage,
      customerId: resolvedCustomerId,
      useGroq: true,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("[ERROR] AI draft failed:", error);
    return NextResponse.json({ error: "Failed to generate draft" }, { status: 500 });
  }
}
