"use client";

import { useCallback, useEffect, useState } from "react";
import {
  fetchInStockProducts,
  type GroundedProduct,
} from "@/lib/ai/product-grounding";
import { useSupabase } from "@/hooks/use-supabase";

export function useInStockProducts() {
  const getSupabase = useSupabase();
  const [products, setProducts] = useState<GroundedProduct[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await fetchInStockProducts(getSupabase());
      setProducts(rows);
    } catch (error) {
      console.error("[ERROR] Failed to load in-stock products:", error);
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [getSupabase]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { products, loading, reload };
}
