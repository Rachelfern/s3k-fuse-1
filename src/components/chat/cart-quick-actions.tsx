"use client";

import { COMMERCE_ROUTES } from "@/lib/chat/quick-replies";
import { cn } from "@/lib/utils";

interface CartQuickActionsProps {
  onNavigate: (href: string) => void;
  showContinueShopping?: boolean;
  disabled?: boolean;
  className?: string;
}

export function CartQuickActions({
  onNavigate,
  showContinueShopping = false,
  disabled = false,
  className,
}: CartQuickActionsProps) {
  const actions = [
    { label: "View Cart", href: COMMERCE_ROUTES.cart },
    { label: "Checkout", href: COMMERCE_ROUTES.checkout },
    ...(showContinueShopping
      ? [{ label: "Continue Shopping", href: COMMERCE_ROUTES.products }]
      : []),
  ];

  return (
    <div className={cn("flex flex-wrap gap-1", className)}>
      {actions.map((action) => (
        <button
          key={action.label}
          type="button"
          disabled={disabled}
          onClick={() => onNavigate(action.href)}
          className={cn(
            "rounded-full border border-[#128c7e]/40 bg-white px-2.5 py-0.5 text-[11px] font-medium leading-tight text-[#075e54] shadow-sm transition-colors hover:bg-[#ecfdf5]",
            disabled && "cursor-not-allowed opacity-50",
          )}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}
