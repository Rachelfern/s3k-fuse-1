"use client";

import { ProductCard } from "@/components/product/product-card";
import { useCart } from "@/hooks/use-cart";
import type { CartSnapshot } from "@/types/cart";
import type { CartUpdateAction } from "@/lib/cart-utils";
import { getProductsByIds } from "@/lib/mock/products";
import { cn } from "@/lib/utils";

interface ChatProductCardProps {
  productIds: string[];
  onCartUpdated?: (
    productName: string,
    snapshot: CartSnapshot,
    action: CartUpdateAction
  ) => void;
  className?: string;
}

export function ChatProductCard({
  productIds,
  onCartUpdated,
  className,
}: ChatProductCardProps) {
  const { getQuantity, addItem, incrementItem, decrementItem } = useCart();
  const products = getProductsByIds(productIds);

  if (products.length === 0) return null;

  return (
    <div className={cn("mt-2 space-y-2", className)}>
      {products.map((product) => {
        const quantity = getQuantity(product.id);

        return (
          <ProductCard
            key={product.id}
            product={product}
            quantity={quantity}
            compact
            onAdd={() => {
              const nextSnapshot = addItem(product.id);
              onCartUpdated?.(product.name, nextSnapshot, "add");
            }}
            onIncrement={() => {
              const nextSnapshot = incrementItem(product.id);
              onCartUpdated?.(product.name, nextSnapshot, "increment");
            }}
            onDecrement={() => {
              const nextSnapshot = decrementItem(product.id);
              onCartUpdated?.(product.name, nextSnapshot, "decrement");
            }}
          />
        );
      })}
    </div>
  );
}
