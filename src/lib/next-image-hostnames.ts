/** Hostnames allowed for `next/image` optimization — safe to import from next.config.ts */
export const NEXT_IMAGE_HOSTNAMES = ["images.unsplash.com"] as const;

export function isNextImageHost(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return NEXT_IMAGE_HOSTNAMES.includes(
      hostname as (typeof NEXT_IMAGE_HOSTNAMES)[number],
    );
  } catch {
    return false;
  }
}
