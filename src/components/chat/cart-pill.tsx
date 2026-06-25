"use client";

import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import { useCart } from "@/hooks/use-cart";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

interface CartPillProps {
  className?: string;
}

export function CartPill({ className }: CartPillProps) {
  const { snapshot } = useCart();

  return (
    <Link
      href="/cart"
      className={cn(
        "flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm transition-colors hover:bg-white/25",
        className
      )}
    >
      <ShoppingBag className="size-3.5" />
      <span>
        {snapshot.itemCount}{" "}
        {snapshot.itemCount === 1 ? "item" : "items"} ·{" "}
        {formatCurrency(snapshot.subtotal)}
      </span>
    </Link>
  );
}
