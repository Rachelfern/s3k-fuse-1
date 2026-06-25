"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import {
  CustomerPrimaryLink,
  CustomerQuickLink,
  CustomerShell,
  customerFieldClassName,
} from "@/components/customer/customer-shell";
import { ProductCard } from "@/components/product/product-card";
import { useCart } from "@/hooks/use-cart";
import { useActiveProducts } from "@/hooks/use-active-products";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

export default function ProductsPage() {
  const {
    snapshot,
    getQuantity,
    applyCartUpdates,
    incrementItem,
    decrementItem,
  } = useCart();
  const { products, loading } = useActiveProducts();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("all");

  const categories = useMemo(() => {
    const values = new Set(products.map((product) => product.category || "Other"));
    return ["all", ...Array.from(values).sort()];
  }, [products]);

  const filteredProducts = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return products.filter((product) => {
      const matchesCategory =
        category === "all" || (product.category || "Other") === category;
      const matchesQuery =
        !normalized ||
        product.name_en.toLowerCase().includes(normalized) ||
        product.description?.toLowerCase().includes(normalized) ||
        product.category?.toLowerCase().includes(normalized);
      return matchesCategory && matchesQuery;
    });
  }, [products, query, category]);

  function addProduct(
    productId: string,
    name: string,
    price: number,
    imageUrl?: string | null,
  ) {
    applyCartUpdates([
      {
        productId,
        productName: name,
        quantity: 1,
        unitPrice: price,
        imageUrl,
      },
    ]);
  }

  return (
    <CustomerShell
      backHref="/chat"
      backLabel="Back to chat"
      subtitle="Products"
      quickActions={
        <>
          <CustomerQuickLink href="/chat">← Back to Chat</CustomerQuickLink>
          <CustomerQuickLink href="/cart" disabled={snapshot.itemCount === 0}>
            🛒 View Cart
            {snapshot.itemCount > 0
              ? ` · ${formatCurrency(snapshot.subtotal)}`
              : ""}
          </CustomerQuickLink>
        </>
      }
      footer={
        snapshot.itemCount > 0 ? (
          <CustomerPrimaryLink href="/cart">
            View Cart · {formatCurrency(snapshot.subtotal)}
          </CustomerPrimaryLink>
        ) : (
          <div className="flex h-11 items-center rounded-full bg-gray-100 px-4 text-sm text-gray-400">
            Add items to your cart
          </div>
        )
      }
    >
      <div className="mb-3 space-y-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search products…"
            className={cn(customerFieldClassName, "pl-9")}
          />
        </div>
        <div className="flex flex-wrap gap-2 pb-1">
          {categories.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setCategory(value)}
              className={cn(
                "shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors",
                category === value
                  ? "bg-[var(--whatsapp-primary)] text-white"
                  : "bg-white text-gray-600 shadow-sm",
              )}
            >
              {value === "all" ? "All" : value}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="py-8 text-center text-sm text-gray-500">Loading products…</p>
      ) : filteredProducts.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-500">
          No products match your search.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredProducts.map((product) => {
            const quantity = getQuantity(product.id);

            return (
              <li key={product.id} className="min-w-0">
                <ProductCard
                  product={{
                    id: product.id,
                    business_id: "",
                    name: product.name_en,
                    description: product.description ?? "",
                    price: product.price,
                    rating: 4.5,
                    reviewCount: 0,
                    image_url: product.image_url,
                    imageEmoji: "📦",
                    imageGradient: "from-gray-100 to-gray-200",
                  }}
                  quantity={quantity}
                  onAdd={() =>
                    addProduct(
                      product.id,
                      product.name_en,
                      product.price,
                      product.image_url,
                    )
                  }
                  onIncrement={() => incrementItem(product.id)}
                  onDecrement={() => decrementItem(product.id)}
                />
              </li>
            );
          })}
        </ul>
      )}
    </CustomerShell>
  );
}
