import { BUSINESS_ID, PRODUCT_IDS } from "@/lib/demo";
import { PRODUCT_IMAGE_URLS } from "@/lib/product-images";

export interface MockProduct {
  id: string;
  business_id: string;
  name: string;
  description: string;
  price: number;
  rating: number;
  reviewCount: number;
  image_url?: string | null;
  imageEmoji: string;
  imageGradient: string;
}

/** Static catalog mirror — UUIDs and names must match lib/seed.ts / Supabase products */
export const mockProducts: MockProduct[] = [
  {
    id: PRODUCT_IDS.alphonsoMango,
    business_id: BUSINESS_ID,
    name: "Alphonso Mango",
    description: "Sweet seasonal mangoes",
    price: 34,
    rating: 4.8,
    reviewCount: 214,
    image_url: PRODUCT_IMAGE_URLS[PRODUCT_IDS.alphonsoMango],
    imageEmoji: "🥭",
    imageGradient: "from-amber-400 to-orange-500",
  },
  {
    id: PRODUCT_IDS.freshBanana,
    business_id: BUSINESS_ID,
    name: "Fresh Banana",
    description: "Ripe bananas",
    price: 25,
    rating: 4.6,
    reviewCount: 189,
    image_url: PRODUCT_IMAGE_URLS[PRODUCT_IDS.freshBanana],
    imageEmoji: "🍌",
    imageGradient: "from-yellow-400 to-amber-500",
  },
  {
    id: PRODUCT_IDS.farmFreshMilk,
    business_id: BUSINESS_ID,
    name: "Farm Fresh Milk 1L",
    description: "Fresh dairy milk",
    price: 75,
    rating: 4.9,
    reviewCount: 342,
    image_url: PRODUCT_IMAGE_URLS[PRODUCT_IDS.farmFreshMilk],
    imageEmoji: "🥛",
    imageGradient: "from-blue-100 to-slate-200",
  },
  {
    id: PRODUCT_IDS.broccoli,
    business_id: BUSINESS_ID,
    name: "Broccoli 1pc",
    description: "Fresh green broccoli",
    price: 29,
    rating: 4.7,
    reviewCount: 156,
    image_url: PRODUCT_IMAGE_URLS[PRODUCT_IDS.broccoli],
    imageEmoji: "🥦",
    imageGradient: "from-green-400 to-emerald-500",
  },
  {
    id: PRODUCT_IDS.tomatoes,
    business_id: BUSINESS_ID,
    name: "Tomatoes 500g",
    description: "Farm-fresh tomatoes",
    price: 18,
    rating: 4.5,
    reviewCount: 98,
    image_url: PRODUCT_IMAGE_URLS[PRODUCT_IDS.tomatoes],
    imageEmoji: "🍅",
    imageGradient: "from-red-400 to-rose-500",
  },
  {
    id: PRODUCT_IDS.chickenBreast,
    business_id: BUSINESS_ID,
    name: "Chicken Breast 500g",
    description: "Lean boneless chicken breast — high protein",
    price: 100,
    rating: 4.8,
    reviewCount: 267,
    image_url: PRODUCT_IMAGE_URLS[PRODUCT_IDS.chickenBreast],
    imageEmoji: "🍗",
    imageGradient: "from-amber-500 to-orange-600",
  },
];

export const mockProductMap = Object.fromEntries(
  mockProducts.map((p) => [p.id, p])
);

export function getProductsByIds(ids: string[]): MockProduct[] {
  return ids
    .map((id) => mockProductMap[id])
    .filter((p): p is MockProduct => Boolean(p));
}
