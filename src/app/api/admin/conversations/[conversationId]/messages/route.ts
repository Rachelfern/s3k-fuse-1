import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/admin/require-admin-user";
import { diagnoseSupabaseError } from "@/lib/supabase/errors";
import { createServiceClient } from "@/lib/supabase/service-client";
import type { Message } from "@/lib/types";

interface RouteContext {
  params: Promise<{ conversationId: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const { user } = await requireAdminUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { conversationId } = await context.params;

  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    if (error) throw error;

    return NextResponse.json({ messages: (data ?? []) as Message[] });
  } catch (error) {
    console.error("[admin/conversations/messages] fetch failed:", error);
    return NextResponse.json(
      { error: diagnoseSupabaseError(error) },
      { status: 500 },
    );
  }
}

export async function POST(request: Request, context: RouteContext) {
  const { user } = await requireAdminUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { conversationId } = await context.params;

  let body: { content?: string; was_ai_drafted?: boolean };
  try {
    body = (await request.json()) as {
      content?: string;
      was_ai_drafted?: boolean;
    };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const content = body.content?.trim();
  if (!content) {
    return NextResponse.json({ error: "content is required" }, { status: 400 });
  }

  try {
    const supabase = createServiceClient();

    const { data: inserted, error: insertError } = await supabase
      .from("messages")
      .insert({
        conversation_id: conversationId,
        sender_type: "admin",
        content,
        was_ai_drafted: body.was_ai_drafted ?? false,
      })
      .select("*")
      .single();

    if (insertError) throw insertError;

    const { error: updateError } = await supabase
      .from("conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", conversationId);

    if (updateError) throw updateError;

    return NextResponse.json({ message: inserted as Message });
  } catch (error) {
    console.error("[admin/conversations/messages] send failed:", error);
    return NextResponse.json(
      { error: diagnoseSupabaseError(error) },
      { status: 500 },
    );
  }
}

export async function PATCH(_request: Request, context: RouteContext) {
  const { user } = await requireAdminUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { conversationId } = await context.params;

  try {
    const supabase = createServiceClient();
    const { error } = await supabase
      .from("conversations")
      .update({ unread_count: 0 })
      .eq("id", conversationId);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[admin/conversations/messages] mark-read failed:", error);
    return NextResponse.json(
      { error: diagnoseSupabaseError(error) },
      { status: 500 },
    );
  }
}
