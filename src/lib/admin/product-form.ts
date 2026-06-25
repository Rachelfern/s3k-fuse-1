import { PRODUCT_CATEGORIES } from "@/lib/admin/product-categories";

export type ProductFormInput = {
  name_en: string;
  description?: string | null;
  category: string;
  price: number;
  image_url: string;
  stock: number;
  active: boolean;
};

export function validateProductFormInput(input: ProductFormInput): string | null {
  const name = input.name_en.trim();
  if (!name) {
    return "Product name is required.";
  }

  if (!Number.isFinite(input.price) || input.price <= 0) {
    return "Price must be greater than 0.";
  }

  const category = input.category.trim();
  if (!category) {
    return "Category is required.";
  }

  if (
    !PRODUCT_CATEGORIES.includes(
      category as (typeof PRODUCT_CATEGORIES)[number],
    )
  ) {
    return "Please select a valid category.";
  }

  const imageUrl = input.image_url.trim();
  if (!imageUrl) {
    return "Product image URL is required.";
  }

  try {
    const parsed = new URL(imageUrl);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return "Image URL must use http or https.";
    }
  } catch {
    return "Please enter a valid image URL.";
  }

  if (!Number.isFinite(input.stock) || input.stock < 0) {
    return "Stock quantity cannot be negative.";
  }

  return null;
}
