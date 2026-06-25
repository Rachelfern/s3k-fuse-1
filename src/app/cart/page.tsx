"use client";

import { Minus, Plus, ShoppingBag } from "lucide-react";
import {
  CustomerPrimaryLink,
  CustomerQuickLink,
  CustomerShell,
} from "@/components/customer/customer-shell";
import { ProductImage } from "@/components/product/product-image";
import { useCart } from "@/hooks/use-cart";
import { useActiveProducts } from "@/hooks/use-active-products";
import { DEFAULT_DELIVERY_FEE } from "@/lib/orders/create-order";
import { formatCurrency } from "@/lib/format";

export default function CartPage() {
  const { snapshot, incrementItem, decrementItem } = useCart();
  const { stockByProductId } = useActiveProducts();
  const isEmpty = snapshot.itemCount === 0;

  if (isEmpty) {
    return (
      <CustomerShell
        backHref="/chat"
        backLabel="Back to chat"
        subtitle="Your Cart"
        quickActions={
          <>
            <CustomerQuickLink href="/chat">← Back to Chat</CustomerQuickLink>
            <CustomerQuickLink href="/products">🛒 Browse Menu</CustomerQuickLink>
          </>
        }
        footer={
          <CustomerPrimaryLink href="/products">Browse Menu</CustomerPrimaryLink>
        }
      >
        <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
          <div className="flex size-16 items-center justify-center rounded-full bg-white shadow-sm">
            <ShoppingBag className="size-8 text-gray-400" />
          </div>
          <p className="text-sm font-medium text-gray-700">Your cart is empty</p>
          <p className="text-xs text-gray-500">
            Add items from the menu to get started
          </p>
        </div>
      </CustomerShell>
    );
  }

  return (
    <CustomerShell
      backHref="/chat"
      backLabel="Back to chat"
      subtitle="Your Cart"
      quickActions={
        <>
          <CustomerQuickLink href="/chat">← Back to Chat</CustomerQuickLink>
          <CustomerQuickLink href="/products">🛒 Browse Menu</CustomerQuickLink>
        </>
      }
      footer={
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-[18px_18px_18px_4px] bg-gray-50 px-4 py-3">
            <span className="text-sm font-medium text-gray-500">Subtotal</span>
            <span className="text-lg font-bold text-[var(--whatsapp-accent)]">
              {formatCurrency(snapshot.subtotal)}
            </span>
          </div>
          <p className="text-center text-xs text-gray-500">
            Delivery {formatCurrency(DEFAULT_DELIVERY_FEE)} · Total at checkout{" "}
            {formatCurrency(snapshot.subtotal + DEFAULT_DELIVERY_FEE)}
          </p>
          <CustomerPrimaryLink href="/checkout">
            Checkout · {formatCurrency(snapshot.subtotal + DEFAULT_DELIVERY_FEE)}
          </CustomerPrimaryLink>
        </div>
      }
    >
      <div className="mb-3 flex justify-center">
        <span className="rounded-full bg-white/60 px-3 py-1 text-xs text-gray-500">
          {snapshot.itemCount} {snapshot.itemCount === 1 ? "item" : "items"}
        </span>
      </div>

      <ul className="flex flex-col gap-2">
        {snapshot.items.map((item) => {
          const availableStock = stockByProductId.get(item.productId) ?? 0;
          const atStockLimit = item.quantity >= availableStock;

          return (
          <li
            key={item.productId}
            className="overflow-hidden rounded-[18px_18px_18px_4px] bg-white shadow-sm"
          >
            <div className="flex gap-3 p-3">
              <ProductImage
                productId={item.productId}
                name={item.product.name}
                imageUrl={item.product.image_url}
                size="sm"
              />

              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-sm font-semibold leading-tight text-gray-900">
                    {item.product.name}
                  </h2>
                  <p className="shrink-0 text-sm font-bold text-[var(--whatsapp-accent)]">
                    {formatCurrency(item.lineSubtotal)}
                  </p>
                </div>

                <p className="mt-1 text-xs text-gray-500">
                  {formatCurrency(item.product.price)} each
                </p>

                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => decrementItem(item.productId)}
                    className="flex size-8 items-center justify-center rounded-full border border-gray-200 bg-gray-50 text-gray-700 transition-colors hover:bg-gray-100"
                    aria-label={`Decrease ${item.product.name} quantity`}
                  >
                    <Minus className="size-4" />
                  </button>
                  <span className="min-w-[1.5rem] text-center text-sm font-semibold tabular-nums text-gray-900">
                    {item.quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => incrementItem(item.productId)}
                    disabled={atStockLimit}
                    className="flex size-8 items-center justify-center rounded-full bg-[var(--whatsapp-primary)] text-white transition-colors hover:bg-[var(--whatsapp-primary-hover)] disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label={`Increase ${item.product.name} quantity`}
                  >
                    <Plus className="size-4" />
                  </button>
                </div>
              </div>
            </div>
          </li>
          );
        })}
      </ul>
    </CustomerShell>
  );
}
