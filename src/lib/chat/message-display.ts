import {
  parseCartConfirmMessage,
  parseCartPickMessage,
} from "@/lib/ai/message-intent";

const INTERNAL_PATTERNS: RegExp[] = [
  /^cart_confirm\|/i,
  /^cart_confirm_reply\|/i,
  /^cart_pick\|/i,
  /^cart_clarify\|/i,
  /^recommendation\|/i,
  /^internal_action:/i,
  /^product_id:/i,
  /\bproduct_id\s*[:=]/i,
  /\binternal_action\s*[:=]/i,
];

export function isInternalPayload(text: string): boolean {
  const trimmed = text.trim();
  return INTERNAL_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export function formatCustomerBubbleContent(
  raw: string,
  productNames?: Map<string, string>,
): string {
  const trimmed = raw.trim();

  const confirmItems = parseCartConfirmMessage(trimmed);
  if (confirmItems) {
    const lines = confirmItems.map((item) => {
      const name = productNames?.get(item.productId) ?? "item";
      const packLabel = item.quantity === 1 ? "pack" : "packs";
      return `✓ Added ${item.quantity} ${packLabel} of ${name}`;
    });
    return lines.join("\n");
  }

  const pickedId = parseCartPickMessage(trimmed);
  if (pickedId) {
    const name = productNames?.get(pickedId);
    return name ? `✓ ${name}` : "✓ Selected";
  }

  if (isInternalPayload(trimmed)) {
    return "✓ Done";
  }

  return raw;
}

export function sanitizeAdminBubbleContent(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;

  if (isInternalPayload(trimmed)) {
    return "How can I help you today?";
  }

  return trimmed
    .replace(/\bproduct_id\s*[:=]\s*[^\s,]+/gi, "")
    .replace(/\binternal_action\s*[:=]\s*[^\s,]+/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function formatCartSystemMessage(items: { name: string; quantity: number }[]): string {
  if (items.length === 0) return "✓ Cart updated";

  const lines = items.map((item) => {
    const packLabel = item.quantity === 1 ? "pack" : "packs";
    return `✓ Added ${item.quantity} ${packLabel} of ${item.name}`;
  });

  return lines.join("\n");
}
