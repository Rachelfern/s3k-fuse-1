import { getProductImageUrl } from "@/lib/product-images";
import { assertCartProductMatch, catalogDebug } from "@/lib/ai/catalog-debug";
import { BUSINESS_ID } from "@/lib/demo";
import { mockProductMap } from "@/lib/mock/products";
import type { MockProduct } from "@/lib/mock/products";
import type { ResolvedCartUpdate } from "@/types/ai";
import type { CartLineItem, CartSnapshot } from "@/types/cart";

function resolveCartProduct(
  productId: string,
  override?: {
    productName?: string;
    unitPrice?: number;
    imageUrl?: string | null;
  },
): MockProduct | null {
  const mock = mockProductMap[productId];
  const image_url = getProductImageUrl({
    id: productId,
    image_url: override?.imageUrl ?? mock?.image_url,
  });

  if (override?.productName && override.unitPrice != null) {
    return {
      id: productId,
      business_id: BUSINESS_ID,
      name: override.productName,
      description: mock?.description ?? "",
      price: override.unitPrice,
      rating: mock?.rating ?? 4.5,
      reviewCount: mock?.reviewCount ?? 0,
      image_url,
      imageEmoji: mock?.imageEmoji ?? "🛒",
      imageGradient: mock?.imageGradient ?? "from-emerald-100 to-teal-100",
    };
  }

  if (mock) {
    return { ...mock, image_url };
  }

  return null;
}

export function computeCartSnapshot(items: CartLineItem[]): CartSnapshot {
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = items.reduce((sum, item) => sum + item.lineSubtotal, 0);
  return { items, itemCount, subtotal };
}

export function addProductToCart(
  items: CartLineItem[],
  productId: string,
  override?: {
    productName?: string;
    unitPrice?: number;
    imageUrl?: string | null;
  },
): CartLineItem[] {
  const existing = items.find((item) => item.productId === productId);
  const product = existing?.product ?? resolveCartProduct(productId, override);
  if (!product) return items;

  if (existing) {
    return items.map((item) =>
      item.productId === productId
        ? {
            ...item,
            quantity: item.quantity + 1,
            lineSubtotal: (item.quantity + 1) * product.price,
          }
        : item
    );
  }

  return [
    ...items,
    {
      productId,
      product,
      quantity: 1,
      lineSubtotal: product.price,
    },
  ];
}

export function incrementProduct(
  items: CartLineItem[],
  productId: string
): CartLineItem[] {
  return addProductToCart(items, productId);
}

export function addProductWithQuantity(
  items: CartLineItem[],
  productId: string,
  quantity: number,
  override?: {
    productName?: string;
    unitPrice?: number;
    imageUrl?: string | null;
  },
): CartLineItem[] {
  const existing = items.find((item) => item.productId === productId);
  const product = existing?.product ?? resolveCartProduct(productId, override);
  if (!product || quantity <= 0) return items;
  if (existing) {
    const nextQuantity = existing.quantity + quantity;
    return items.map((item) =>
      item.productId === productId
        ? {
            ...item,
            quantity: nextQuantity,
            lineSubtotal: nextQuantity * product.price,
          }
        : item
    );
  }

  return [
    ...items,
    {
      productId,
      product,
      quantity,
      lineSubtotal: quantity * product.price,
    },
  ];
}

export function applyCartUpdatesToItems(
  items: CartLineItem[],
  updates: ResolvedCartUpdate[]
): CartLineItem[] {
  let nextItems = items;

  for (const update of updates) {
    const clicked = {
      id: update.productId,
      name: update.productName,
    };

    nextItems = addProductWithQuantity(
      nextItems,
      update.productId,
      update.quantity,
      {
        productName: update.productName,
        unitPrice: update.unitPrice,
        imageUrl: update.imageUrl,
      },
    );

    const addedItem = nextItems.find((item) => item.productId === update.productId);
    if (addedItem) {
      const added = {
        id: addedItem.productId,
        name: addedItem.product.name,
      };
      assertCartProductMatch(clicked, added);
      catalogDebug("cart_apply_update", { clicked, added });
    }
  }

  return nextItems;
}

export function decrementProduct(
  items: CartLineItem[],
  productId: string
): CartLineItem[] {
  const existing = items.find((item) => item.productId === productId);
  const product = existing?.product ?? mockProductMap[productId];
  if (!product) return items;

  return items
    .map((item) => {
      if (item.productId !== productId) return item;
      const quantity = item.quantity - 1;
      if (quantity <= 0) return null;
      return {
        ...item,
        quantity,
        lineSubtotal: quantity * product.price,
      };
    })
    .filter((item): item is CartLineItem => item !== null);
}

export function formatCartSummaryLines(snapshot: CartSnapshot): string {
  if (snapshot.itemCount === 0) {
    return "Your cart is empty.";
  }

  const lines = snapshot.items.map(
    (item) => `• ${item.product.name} ×${item.quantity}`
  );
  lines.push("");
  lines.push(
    `Subtotal: ₹${snapshot.subtotal.toLocaleString("en-IN")}`
  );
  return lines.join("\n");
}

export function formatAddedConfirmation(
  productName: string,
  snapshot: CartSnapshot
): string {
  const itemLabel = snapshot.itemCount === 1 ? "item" : "items";
  return `${productName} added to your cart.\n\nCart:\n${snapshot.itemCount} ${itemLabel}\n₹${snapshot.subtotal.toLocaleString("en-IN")}`;
}

export type CartUpdateAction = "add" | "increment" | "decrement" | "remove" | "clear";

export function formatCartUpdateConfirmation(
  productName: string,
  snapshot: CartSnapshot,
  action: CartUpdateAction
): string {
  if (action === "decrement") {
    if (snapshot.itemCount === 0) {
      return `${productName} removed from your cart.\n\nCart:\n0 items\n₹0`;
    }
    const itemLabel = snapshot.itemCount === 1 ? "item" : "items";
    return `${productName} quantity updated.\n\nCart:\n${snapshot.itemCount} ${itemLabel}\n₹${snapshot.subtotal.toLocaleString("en-IN")}`;
  }

  return formatAddedConfirmation(productName, snapshot);
}

export function formatCartReply(snapshot: CartSnapshot): string {
  if (snapshot.itemCount === 0) {
    return "Your cart is empty. Type \"menu\" to browse products.";
  }

  const itemLabel = snapshot.itemCount === 1 ? "item" : "items";
  return `Here's your cart:\n\n${formatCartSummaryLines(snapshot)}\n\n${snapshot.itemCount} ${itemLabel} total.`;
}
