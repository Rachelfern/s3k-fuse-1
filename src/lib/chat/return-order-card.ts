import {
  parseReturnOrderCardIntent,
  RETURN_ORDER_CARD_INTENT_PREFIX,
} from "@/lib/orders/return-request-flow";

export { parseReturnOrderCardIntent, RETURN_ORDER_CARD_INTENT_PREFIX };

export type ParsedReturnOrderCard = {
  orderId: string;
  orderRef: string;
  deliveredLabel: string;
  items: { label: string; quantity: number }[];
};

export function isReturnOrderCardIntent(intent: string | null): boolean {
  return parseReturnOrderCardIntent(intent) !== null;
}

export function parseReturnOrderCardContent(
  content: string,
): Omit<ParsedReturnOrderCard, "orderId"> | null {
  const lines = content.split("\n").map((line) => line.trim());
  if (!lines.some((line) => line.includes("Latest Delivered Order"))) return null;

  const orderRefLine = lines.find((line) => line.startsWith("Order ID:"));
  const deliveredLine = lines.find((line) => line.startsWith("Delivered:"));
  if (!orderRefLine || !deliveredLine) return null;

  const orderRef = orderRefLine.replace(/^Order ID:\s*/i, "").trim();
  const deliveredLabel = deliveredLine.replace(/^Delivered:\s*/i, "").trim();

  const itemsStart = lines.findIndex((line) => line === "Items:");
  const itemsEnd = lines.findIndex(
    (line, index) => index > itemsStart && line.startsWith("Would you like to"),
  );

  const itemLines =
    itemsStart >= 0
      ? lines.slice(itemsStart + 1, itemsEnd >= 0 ? itemsEnd : undefined)
      : [];

  const items = itemLines
    .map((line) => {
      const match = line.match(/^•\s*(.+?)\s×\s*(\d+)\s*$/);
      if (!match?.[1] || !match[2]) return null;
      return {
        label: match[1].trim(),
        quantity: Number.parseInt(match[2], 10),
      };
    })
    .filter((item): item is { label: string; quantity: number } => Boolean(item));

  if (!orderRef || !deliveredLabel) return null;

  return { orderRef, deliveredLabel, items };
}

export function parseReturnOrderCard(input: {
  intent: string | null;
  content: string;
}): ParsedReturnOrderCard | null {
  const orderId = parseReturnOrderCardIntent(input.intent);
  if (!orderId) return null;

  const parsed = parseReturnOrderCardContent(input.content);
  if (!parsed) return null;

  return { orderId, ...parsed };
}
