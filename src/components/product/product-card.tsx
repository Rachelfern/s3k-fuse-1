"use client";

import { Minus, Plus, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProductImage } from "@/components/product/product-image";
import { formatCurrency } from "@/lib/format";
import type { MockProduct } from "@/lib/mock/products";
import { cn } from "@/lib/utils";

interface ProductCardProps {
  product: MockProduct;
  quantity?: number;
  compact?: boolean;
  tag?: string;
  onAdd?: () => void;
  onIncrement?: () => void;
  onDecrement?: () => void;
  className?: string;
}

export function ProductCard({
  product,
  quantity = 0,
  compact = false,
  tag,
  onAdd,
  onIncrement,
  onDecrement,
  className,
}: ProductCardProps) {
  const inCart = quantity > 0;

  return (
    <article
      className={cn(
        "overflow-hidden rounded-xl border border-border/60 bg-white shadow-sm",
        className
      )}
    >
      <div className="relative">
        <ProductImage
          productId={product.id}
          name={product.name}
          imageUrl={product.image_url}
          fill
          className={compact ? "h-24 rounded-t-xl" : "h-32 rounded-t-xl"}
        />
        {inCart && (
          <span className="absolute right-2 top-2 rounded-full bg-[var(--whatsapp-primary)] px-2 py-0.5 text-xs font-semibold text-white shadow">
            ×{quantity}
          </span>
        )}
      </div>

      <div className={cn("space-y-2", compact ? "p-2.5" : "p-3")}>
        <div className="flex items-start justify-between gap-2">
          <h3
            className={cn(
              "min-w-0 break-words font-semibold leading-tight text-foreground",
              compact ? "text-sm" : "text-base"
            )}
          >
            {product.name}
          </h3>
          <p className="shrink-0 text-sm font-bold text-[var(--whatsapp-accent)]">
            {formatCurrency(product.price)}
          </p>
        </div>

        {!compact && (
          <p className="line-clamp-2 text-xs text-muted-foreground">
            {product.description}
          </p>
        )}

        {tag ? (
          <span className="inline-block rounded-full bg-[var(--whatsapp-accent)]/10 px-2 py-0.5 text-[10px] font-medium text-[var(--whatsapp-accent)]">
            {tag}
          </span>
        ) : null}

        <div className="flex items-center gap-1.5">
          <div className="flex items-center gap-0.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star
                key={i}
                className={cn(
                  "size-3",
                  i < Math.floor(product.rating)
                    ? "fill-amber-400 text-amber-400"
                    : "fill-muted text-muted"
                )}
              />
            ))}
          </div>
          <span className="text-xs font-medium text-foreground">
            {product.rating}
          </span>
          <span className="text-xs text-muted-foreground">
            ({product.reviewCount})
          </span>
        </div>

        {inCart ? (
          <div className="flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-8 shrink-0 rounded-lg"
              onClick={onDecrement}
              aria-label={`Decrease ${product.name} quantity`}
            >
              <Minus className="size-4" />
            </Button>
            <span className="flex-1 text-center text-sm font-semibold tabular-nums">
              {quantity}
            </span>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-8 shrink-0 rounded-lg"
              onClick={onIncrement}
              aria-label={`Increase ${product.name} quantity`}
            >
              <Plus className="size-4" />
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            size="sm"
            className="h-8 w-full rounded-lg text-xs font-semibold"
            onClick={onAdd}
          >
            Add to cart
          </Button>
        )}
      </div>
    </article>
  );
}
