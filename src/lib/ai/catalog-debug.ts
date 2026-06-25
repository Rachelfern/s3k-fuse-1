export const CATALOG_DEBUG_ENABLED =
  process.env.NEXT_PUBLIC_CATALOG_DEBUG === "true" ||
  process.env.CATALOG_DEBUG === "true";

export function catalogDebug(
  stage: string,
  data: Record<string, unknown> | unknown[],
): void {
  if (!CATALOG_DEBUG_ENABLED) return;
  console.log(`[CATALOG_DEBUG] ${stage}`, data);
}

export function assertCartProductMatch(
  clicked: { id: string; name: string },
  added: { id: string; name: string },
): void {
  if (clicked.id === added.id) return;

  const diagnostic = { clicked, added };
  console.error("[CATALOG_ASSERT] Product ID mismatch", diagnostic);

  if (process.env.NODE_ENV !== "production") {
    throw new Error(
      `Cart product mismatch: clicked ${clicked.id} (${clicked.name}) but added ${added.id} (${added.name})`,
    );
  }
}
