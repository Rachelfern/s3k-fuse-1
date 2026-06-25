"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchActiveProducts,
  type GroundedProduct,
} from "@/lib/ai/product-grounding";
import { useSupabase } from "@/hooks/use-supabase";

export function useActiveProducts() {
  const getSupabase = useSupabase();
  const [products, setProducts] = useState<GroundedProduct[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await fetchActiveProducts(getSupabase());
      setProducts(rows);
    } catch (error) {
      console.error("[ERROR] Failed to load active products:", error);
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [getSupabase]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const stockByProductId = useMemo(() => {
    return new Map(products.map((product) => [product.id, product.stock]));
  }, [products]);

  return { products, loading, reload, stockByProductId };
}
