import { formatCurrency } from "@/lib/format";
import type { CartUpdateAction } from "@/lib/cart-utils";
import { COMMERCE_ROUTES } from "@/lib/chat/quick-replies";

export const CART_ACTION_INTENT_PREFIX = "cart_action:";
export const CART_UNDO_INTENT_PREFIX = "cart_undo:";

export type CartActionType = CartUpdateAction | "remove" | "clear";

export type CartActionPayload = {
  type: CartActionType;
  productId?: string;
  productName?: string;
  previousQuantity?: number;
  newQuantity?: number;
  unitPrice?: number;
  lineTotal?: number;
  cartTotal: number;
  removedQuantity?: number;
};

export type CartUndoPayload = {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
};

export type CartMutationDetails = {
  productId: string;
  productName: string;
  action: CartActionType;
  previousQuantity: number;
  newQuantity: number;
  unitPrice: number;
  cartTotal: number;
  removedQuantity?: number;
};

export function buildCartActionPayload(
  mutation: CartMutationDetails,
): CartActionPayload {
  const removedQuantity =
    mutation.action === "remove"
      ? mutation.removedQuantity ?? mutation.previousQuantity
      : undefined;

  return {
    type: mutation.action,
    productId: mutation.productId,
    productName: mutation.productName,
    previousQuantity: mutation.previousQuantity,
    newQuantity: mutation.newQuantity,
    unitPrice: mutation.unitPrice,
    lineTotal:
      mutation.action === "add"
        ? mutation.unitPrice * mutation.newQuantity
        : undefined,
    cartTotal: mutation.cartTotal,
    removedQuantity,
  };
}

export function encodeCartActionIntent(payload: CartActionPayload): string {
  return `${CART_ACTION_INTENT_PREFIX}${JSON.stringify(payload)}`;
}

export function parseCartActionIntent(
  intent: string | null | undefined,
): CartActionPayload | null {
  if (!intent?.startsWith(CART_ACTION_INTENT_PREFIX)) return null;

  try {
    return JSON.parse(
      intent.slice(CART_ACTION_INTENT_PREFIX.length),
    ) as CartActionPayload;
  } catch {
    return null;
  }
}

export function isCartActionIntent(intent: string | null | undefined): boolean {
  return Boolean(parseCartActionIntent(intent));
}

export function encodeCartUndoIntent(payload: CartUndoPayload): string {
  return `${CART_UNDO_INTENT_PREFIX}${JSON.stringify(payload)}`;
}

export function parseCartUndoMessage(text: string): CartUndoPayload | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith(CART_UNDO_INTENT_PREFIX)) return null;

  try {
    return JSON.parse(
      trimmed.slice(CART_UNDO_INTENT_PREFIX.length),
    ) as CartUndoPayload;
  } catch {
    return null;
  }
}

export function formatCartActionContent(payload: CartActionPayload): string {
  switch (payload.type) {
    case "add": {
      const qty = payload.newQuantity ?? 1;
      const lineTotal =
        payload.lineTotal ?? (payload.unitPrice ?? 0) * qty;
      return [
        "🛒 Added to Cart",
        "",
        `${payload.productName} × ${qty}`,
        formatCurrency(lineTotal),
      ].join("\n");
    }
    case "increment":
      return [
        "➕ Quantity Updated",
        "",
        payload.productName ?? "Item",
        `${payload.previousQuantity ?? 0} → ${payload.newQuantity ?? 0}`,
        "",
        `Cart Total: ${formatCurrency(payload.cartTotal)}`,
      ].join("\n");
    case "decrement":
      return [
        "➖ Quantity Updated",
        "",
        payload.productName ?? "Item",
        `${payload.previousQuantity ?? 0} → ${payload.newQuantity ?? 0}`,
        "",
        `Cart Total: ${formatCurrency(payload.cartTotal)}`,
      ].join("\n");
    case "remove":
      return [
        "❌ Removed from Cart",
        "",
        payload.productName ?? "Item",
        "",
        `Cart Total: ${formatCurrency(payload.cartTotal)}`,
      ].join("\n");
    case "clear":
      return ["🗑️ Cart Cleared", "", "Your cart is now empty."].join("\n");
    default:
      return "Cart updated";
  }
}

export function buildCartActionQuickReplies(payload: CartActionPayload) {
  if (payload.type === "remove" && payload.productId && payload.productName) {
    const undoPayload: CartUndoPayload = {
      productId: payload.productId,
      productName: payload.productName,
      quantity: payload.removedQuantity ?? 1,
      unitPrice: payload.unitPrice ?? 0,
    };

    return [
      { label: "Undo", message: encodeCartUndoIntent(undoPayload) },
      { label: "View Cart", href: COMMERCE_ROUTES.cart },
    ];
  }

  if (payload.type === "clear") {
    return [{ label: "Browse Products", href: COMMERCE_ROUTES.products }];
  }

  return [{ label: "View Cart", href: COMMERCE_ROUTES.cart }];
}

export function cartActionFromAddItem(input: {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  cartTotal: number;
}): CartActionPayload {
  return {
    type: "add",
    productId: input.productId,
    productName: input.productName,
    newQuantity: input.quantity,
    unitPrice: input.unitPrice,
    lineTotal: input.unitPrice * input.quantity,
    cartTotal: input.cartTotal,
  };
}

export function cartActionFromRemoveItem(input: {
  productId: string;
  productName: string;
  removedQuantity: number;
  unitPrice: number;
  cartTotal: number;
}): CartActionPayload {
  return {
    type: "remove",
    productId: input.productId,
    productName: input.productName,
    removedQuantity: input.removedQuantity,
    unitPrice: input.unitPrice,
    cartTotal: input.cartTotal,
    previousQuantity: input.removedQuantity,
    newQuantity: 0,
  };
}
