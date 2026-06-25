import { PRODUCT_IDS } from "@/lib/demo";
import { isNextImageHost, NEXT_IMAGE_HOSTNAMES } from "@/lib/next-image-hostnames";

export { isNextImageHost, NEXT_IMAGE_HOSTNAMES };

/** Canonical product images — must match supabase/seed.sql */
export const PRODUCT_IMAGE_URLS: Record<string, string> = {
  [PRODUCT_IDS.alphonsoMango]:
    "https://images.unsplash.com/photo-1553279768-865429fa0078?w=400",
  [PRODUCT_IDS.freshBanana]:
    "https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?w=400",
  [PRODUCT_IDS.farmFreshMilk]:
    "https://images.unsplash.com/photo-1563636619-e9143da7973b?w=400",
  [PRODUCT_IDS.broccoli]:
    "https://images.unsplash.com/photo-1459411621453-7b03977f4bfc?w=400",
  [PRODUCT_IDS.tomatoes]:
    "https://images.unsplash.com/photo-1546094096-0df4bcaaa337?w=400",
  [PRODUCT_IDS.chickenBreast]:
    "https://images.unsplash.com/photo-1604503468506-440b70325a3a?w=400",
};

export function getProductImageUrl(input: {
  id: string;
  image_url?: string | null;
}): string | null {
  const trimmed = input.image_url?.trim();
  if (trimmed) return trimmed;
  return PRODUCT_IMAGE_URLS[input.id] ?? null;
}
