import type { Product } from "@/lib/types";
import { createServiceClient } from "@/lib/supabase/service-client";

export type ProductFilter = "all" | "active" | "inactive";

export async function fetchAdminProducts(
  filter: ProductFilter = "all",
): Promise<Product[]> {
  const supabase = createServiceClient();

  let query = supabase
    .from("products")
    .select("*")
    .order("name_en", { ascending: true });

  if (filter === "active") {
    query = query.eq("active", true);
  } else if (filter === "inactive") {
    query = query.eq("active", false);
  }

  const { data, error } = await query;

  if (error) throw error;

  const rows = (data ?? []).map((row) => ({
    ...row,
    price: Number(row.price),
    stock: Number(row.stock),
  }));

  if (process.env.NODE_ENV === "development") {
    console.log("[ADMIN PRODUCTS FETCH]", { filter, rowsReturned: rows.length, error: null });
  }

  return rows;
}
