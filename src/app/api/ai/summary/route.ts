import { summarizeConversation } from "@/lib/ai/summary-service";
import { createServiceClient } from "@/lib/supabase/service-client";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      conversationId?: string;
      conversation_id?: string;
      forceRefresh?: boolean;
    };

    const conversationId = body.conversationId ?? body.conversation_id;

    if (!conversationId) {
      return NextResponse.json(
        { error: "conversationId is required" },
        { status: 400 },
      );
    }

    const supabase = createServiceClient();
    const result = await summarizeConversation(supabase, conversationId, {
      forceRefresh: body.forceRefresh === true,
    });

    return NextResponse.json({
      summary: result.summary,
      nextBestAction: result.nextBestAction,
      suggestedAction: result.suggestedAction,
      suggestedDrafts: result.suggestedDrafts,
      issueType: result.issueType,
      priorityScore: result.priorityScore,
      priorityLevel: result.priorityLevel,
      customerIntent: result.customerIntent,
      suggestedReply: result.suggestedReply,
    });
  } catch (error) {
    console.error("[ERROR] AI summary failed:", error);
    return NextResponse.json(
      { error: "Failed to generate summary" },
      { status: 500 },
    );
  }
}
