"use client";

import { Minus, Plus } from "lucide-react";
import { ProductImage } from "@/components/product/product-image";
import { assertCartProductMatch, catalogDebug } from "@/lib/ai/catalog-debug";
import { useCart } from "@/hooks/use-cart";
import { formatCurrency } from "@/lib/format";
import type { GroundedProduct } from "@/lib/ai/product-grounding";
import { cn } from "@/lib/utils";

interface GroundedProductCardProps {
  product: GroundedProduct;
  disabled?: boolean;
  className?: string;
}

export function GroundedProductCard({
  product,
  disabled = false,
  className,
}: GroundedProductCardProps) {
  const {
    getQuantity,
    applyCartUpdates,
    incrementItem,
    decrementItem,
    recordCartMutation,
  } = useCart();
  const quantity = getQuantity(product.id);
  const inCart = quantity > 0;
  const isOutOfStock = product.stock <= 0;
  const atStockLimit = quantity >= product.stock;

  const cartUpdate = {
    productId: product.id,
    productName: product.name_en,
    quantity: 1,
    unitPrice: product.price,
    imageUrl: product.image_url,
  };

  const handleAddToCart = () => {
    const previousQuantity = getQuantity(product.id);
    const clicked = { id: product.id, name: product.name_en };
    catalogDebug("clicked_product", clicked);

    const snapshot = applyCartUpdates([cartUpdate]);
    const addedItem = snapshot.items.find((item) => item.productId === product.id);

    if (addedItem) {
      const added = {
        id: addedItem.productId,
        name: addedItem.product.name,
      };
      assertCartProductMatch(clicked, added);
      catalogDebug("cart_added_product", added);
    }

    const newQuantity =
      snapshot.items.find((item) => item.productId === product.id)?.quantity ??
      previousQuantity + 1;

    recordCartMutation({
      productId: product.id,
      productName: product.name_en,
      action: "add",
      previousQuantity,
      newQuantity,
      unitPrice: product.price,
      cartTotal: snapshot.subtotal,
    });
  };

  const handleIncrement = () => {
    const previousQuantity = getQuantity(product.id);
    const snapshot = incrementItem(product.id);
    const newQuantity =
      snapshot.items.find((item) => item.productId === product.id)?.quantity ??
      previousQuantity + 1;

    recordCartMutation({
      productId: product.id,
      productName: product.name_en,
      action: "increment",
      previousQuantity,
      newQuantity,
      unitPrice: product.price,
      cartTotal: snapshot.subtotal,
    });
  };

  const handleDecrement = () => {
    const previousQuantity = getQuantity(product.id);
    const snapshot = decrementItem(product.id);
    const newQuantity =
      snapshot.items.find((item) => item.productId === product.id)?.quantity ?? 0;

    recordCartMutation({
      productId: product.id,
      productName: product.name_en,
      action: newQuantity === 0 ? "remove" : "decrement",
      previousQuantity,
      newQuantity,
      unitPrice: product.price,
      cartTotal: snapshot.subtotal,
      removedQuantity: newQuantity === 0 ? previousQuantity : undefined,
    });
  };

  return (
    <article
      className={cn(
        "w-full overflow-hidden rounded-lg border border-black/5 bg-white shadow-sm",
        className,
      )}
    >
      <div className="flex gap-2 p-1.5 md:gap-3 md:p-2 lg:p-2.5">
        <ProductImage
          productId={product.id}
          name={product.name_en}
          imageUrl={product.image_url}
          size="xs"
          className="md:size-16 lg:size-[4.5rem]"
        />

        <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
          <div className="flex items-start justify-between gap-1.5">
            <h3 className="min-w-0 break-words text-[13px] font-medium leading-tight text-gray-900 md:text-sm lg:text-[15px]">
              {product.name_en}
            </h3>
            <p className="shrink-0 text-[13px] font-semibold text-[#128c7e] md:text-sm">
              {formatCurrency(product.price)}
            </p>
          </div>

          <div className="flex justify-end">
            {inCart ? (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={disabled}
                  onClick={handleDecrement}
                  className="flex size-5 items-center justify-center rounded-full border border-gray-200 text-gray-600 disabled:opacity-50"
                  aria-label={`Decrease ${product.name_en} quantity`}
                >
                  <Minus className="size-2.5" />
                </button>
                <span className="min-w-[1rem] text-center text-[11px] font-semibold tabular-nums">
                  {quantity}
                </span>
                <button
                  type="button"
                  disabled={disabled || atStockLimit}
                  onClick={handleIncrement}
                  className="flex size-5 items-center justify-center rounded-full border border-gray-200 text-gray-600 disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label={`Increase ${product.name_en} quantity`}
                >
                  <Plus className="size-2.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={disabled || isOutOfStock}
                onClick={handleAddToCart}
                className="rounded-full bg-[#128c7e] px-2 py-0.5 text-[10px] font-semibold text-white transition-colors hover:bg-[#075e54] disabled:cursor-not-allowed disabled:opacity-50 md:px-3 md:py-1 md:text-xs"
              >
                {isOutOfStock ? "Out of Stock" : "+ Add to Cart"}
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

export function GroundingIndicator() {
  return null;
}
