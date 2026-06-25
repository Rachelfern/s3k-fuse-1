import { NextResponse } from "next/server";
import { fetchAdminConversations } from "@/lib/admin/conversations-list";
import { requireAdminUser } from "@/lib/admin/require-admin-user";
import { diagnoseSupabaseError } from "@/lib/supabase/errors";

export async function GET() {
  const { user } = await requireAdminUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const conversations = await fetchAdminConversations();
    return NextResponse.json({ conversations });
  } catch (error) {
    console.error("[admin/conversations] fetch failed:", error);
    return NextResponse.json(
      { error: diagnoseSupabaseError(error) },
      { status: 500 },
    );
  }
}
