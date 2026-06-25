"use client";

import { useCallback, useRef } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/types";

export function useSupabase() {
  const clientRef = useRef<SupabaseClient<Database> | null>(null);

  return useCallback(() => {
    if (!clientRef.current) {
      clientRef.current = createClient();
    }
    return clientRef.current;
  }, []);
}
