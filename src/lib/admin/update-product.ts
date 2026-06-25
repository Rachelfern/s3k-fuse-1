import {
  validateProductFormInput,
  type ProductFormInput,
} from "@/lib/admin/product-form";
import { createServiceClient } from "@/lib/supabase/service-client";
import type { Product } from "@/lib/types";

function mapProductRow(data: Product): Product {
  return {
    ...data,
    price: Number(data.price),
    stock: Number(data.stock),
  };
}

export async function updateProduct(
  productId: string,
  input: ProductFormInput,
): Promise<Product> {
  const validationError = validateProductFormInput(input);
  if (validationError) {
    throw new Error(validationError);
  }

  const supabase = createServiceClient();
  const stock = Math.floor(input.stock);

  const { data, error } = await supabase
    .from("products")
    .update({
      name_en: input.name_en.trim(),
      description: input.description?.trim() || null,
      category: input.category.trim(),
      price: input.price,
      stock,
      image_url: input.image_url.trim(),
      active: input.active,
    })
    .eq("id", productId)
    .select("*")
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      throw new Error("Product not found.");
    }
    throw error;
  }

  if (!data) throw new Error("Product was not updated.");

  return mapProductRow(data);
}
