import { BUSINESS_ID } from "@/lib/demo";
import {
  validateProductFormInput,
  type ProductFormInput,
} from "@/lib/admin/product-form";
import { createServiceClient } from "@/lib/supabase/service-client";
import type { Product } from "@/lib/types";

export type CreateProductInput = ProductFormInput;

export function validateCreateProductInput(
  input: CreateProductInput,
): string | null {
  return validateProductFormInput(input);
}

export async function createProduct(
  input: CreateProductInput,
): Promise<Product> {
  const validationError = validateCreateProductInput(input);
  if (validationError) {
    throw new Error(validationError);
  }

  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("products")
    .insert({
      business_id: BUSINESS_ID,
      name_en: input.name_en.trim(),
      description: input.description?.trim() || null,
      category: input.category.trim(),
      price: input.price,
      stock: Math.floor(input.stock),
      image_url: input.image_url.trim(),
      active: input.active,
    })
    .select("*")
    .single();

  if (error) throw error;
  if (!data) throw new Error("Product was not created.");

  return {
    ...data,
    price: Number(data.price),
    stock: Number(data.stock),
  };
}
