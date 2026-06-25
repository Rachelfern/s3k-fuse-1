export const PRODUCT_CATEGORIES = [
  "Fruits",
  "Vegetables",
  "Dairy",
  "Grains",
  "Snacks",
  "Beverages",
  "General",
] as const;

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];
