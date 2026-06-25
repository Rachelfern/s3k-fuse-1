import { createClient } from "@/lib/supabase/server";

export async function requireAdminUser() {
  const supabase = await createClient();
  const [
    {
      data: { user },
      error,
    },
    {
      data: { session },
    },
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase.auth.getSession(),
  ]);

  if (process.env.NODE_ENV === "development" && !user) {
    console.error("[requireAdminUser] unauthorized", {
      error: error?.message ?? null,
      user,
      sessionPresent: Boolean(session),
      sessionExpiresAt: session?.expires_at ?? null,
    });
  }

  return { supabase, user };
}
