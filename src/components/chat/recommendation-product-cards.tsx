"use client";

import { useEffect, useMemo } from "react";
import {
  GroundedProductCard,
  GroundingIndicator,
} from "@/components/chat/grounded-product-card";
import { catalogDebug } from "@/lib/ai/catalog-debug";
import { orderProductsByIds } from "@/lib/ai/product-catalog-utils";
import { useInStockProducts } from "@/hooks/use-in-stock-products";
import { matchProductsInText } from "@/lib/ai/product-grounding";

interface RecommendationProductCardsProps {
  productIds: string[];
  disabled?: boolean;
  onNavigate?: (href: string) => void;
}

export function RecommendationProductCards({
  productIds,
  disabled = false,
}: RecommendationProductCardsProps) {
  const { products } = useInStockProducts();

  const recommended = useMemo(
    () => orderProductsByIds(productIds, products),
    [products, productIds],
  );

  useEffect(() => {
    if (recommended.length === 0) return;
    catalogDebug(
      "rendered_cards",
      recommended.map((product) => ({ id: product.id, name: product.name_en })),
    );
  }, [recommended]);

  if (recommended.length === 0) return null;

  return (
    <div className="mt-1.5 w-full space-y-1">
      {recommended.map((product) => (
        <GroundedProductCard
          key={product.id}
          product={product}
          disabled={disabled}
        />
      ))}
      <GroundingIndicator />
    </div>
  );
}

interface TextMatchedProductCardsProps {
  messageText: string;
  excludeProductIds?: string[];
  disabled?: boolean;
  onNavigate?: (href: string) => void;
}

export function TextMatchedProductCards({
  messageText,
  excludeProductIds = [],
  disabled = false,
}: TextMatchedProductCardsProps) {
  const { products } = useInStockProducts();

  const matched = useMemo(() => {
    const exclude = new Set(excludeProductIds);
    return matchProductsInText(messageText, products).filter(
      (product) => !exclude.has(product.id),
    );
  }, [messageText, products, excludeProductIds]);

  if (matched.length === 0) return null;

  return (
    <div className="mt-1.5 w-full space-y-1">
      {matched.map((product) => (
        <GroundedProductCard
          key={product.id}
          product={product}
          disabled={disabled}
        />
      ))}
      <GroundingIndicator />
    </div>
  );
}
