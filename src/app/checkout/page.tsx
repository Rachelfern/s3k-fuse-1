"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  CustomerCard,
  CustomerPrimaryButton,
  CustomerQuickLink,
  CustomerSectionTitle,
  CustomerShell,
  customerFieldClassName,
} from "@/components/customer/customer-shell";
import { ProductImage } from "@/components/product/product-image";
import { useCart } from "@/hooks/use-cart";
import { useCheckout } from "@/hooks/use-checkout";
import {
  getCustomerSession,
  saveVaartaProfile,
} from "@/lib/chat/customer-storage";
import { resetLocalCustomerJourneyAfterDeletion } from "@/lib/dpdp/reset-local-journey";
import { DEFAULT_DELIVERY_FEE } from "@/lib/orders/create-order";
import { formatCurrency } from "@/lib/format";
import { emptyCheckoutDetails, type CheckoutDetails } from "@/types/checkout";

function getInitialCheckoutDetails(
  checkoutDetails: CheckoutDetails,
): CheckoutDetails {
  const session = getCustomerSession();
  return {
    name: session.customerName ?? checkoutDetails.name,
    phone: session.phone ?? checkoutDetails.phone,
    address: checkoutDetails.address,
  };
}

export default function CheckoutPage() {
  const router = useRouter();
  const { snapshot } = useCart();
  const { checkoutDetails, setCheckoutDetails, resetCheckout } = useCheckout();
  const [form, setForm] = useState<CheckoutDetails>(() =>
    getInitialCheckoutDetails(checkoutDetails),
  );
  const [error, setError] = useState<string | null>(null);

  const isEmpty = snapshot.itemCount === 0;

  useEffect(() => {
    const session = getCustomerSession();
    if (!session.customerId) return;

    void (async () => {
      try {
        const response = await fetch(
          `/api/customer/profile?customerId=${encodeURIComponent(session.customerId!)}`,
        );
        if (!response.ok) return;

        const profile = (await response.json()) as {
          deletionStatus?: string;
        };

        if (profile.deletionStatus === "deleted") {
          resetLocalCustomerJourneyAfterDeletion();
          resetCheckout();
          setForm(emptyCheckoutDetails);
        }
      } catch {
        /* profile check is best-effort */
      }
    })();
  }, [resetCheckout]);

  function updateField(field: keyof CheckoutDetails, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleContinue(e: React.FormEvent) {
    e.preventDefault();
    const name = form.name.trim();
    const phone = form.phone.trim();
    const address = form.address.trim();

    if (!name || !phone || !address) {
      setError("Please fill in name, phone number, and delivery address.");
      return;
    }

    setError(null);
    saveVaartaProfile({ name, phone, address });
    setCheckoutDetails({ name, phone, address });
    router.push("/payment");
  }

  if (isEmpty) {
    return (
      <CustomerShell
        backHref="/cart"
        backLabel="Back to cart"
        subtitle="Checkout"
        quickActions={
          <>
            <CustomerQuickLink href="/chat">← Back to Chat</CustomerQuickLink>
            <CustomerQuickLink href="/products">🛒 Browse Menu</CustomerQuickLink>
          </>
        }
        footer={
          <CustomerPrimaryButton
            type="button"
            onClick={() => router.push("/products")}
          >
            Browse Menu
          </CustomerPrimaryButton>
        }
      >
        <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
          <p className="text-sm font-medium text-gray-700">Your cart is empty</p>
          <Link
            href="/chat"
            className="text-xs font-medium text-[var(--whatsapp-accent)] underline"
          >
            Return to chat
          </Link>
        </div>
      </CustomerShell>
    );
  }

  return (
    <CustomerShell
      backHref="/cart"
      backLabel="Back to cart"
      subtitle="Checkout"
      quickActions={
        <>
          <CustomerQuickLink href="/chat">← Back to Chat</CustomerQuickLink>
          <CustomerQuickLink href="/cart">🛒 Back to Cart</CustomerQuickLink>
          <CustomerQuickLink href="/products">📋 Browse Menu</CustomerQuickLink>
        </>
      }
      footer={
        <form onSubmit={handleContinue} className="space-y-3">
          <div className="flex items-center justify-between rounded-[18px_18px_18px_4px] bg-gray-50 px-4 py-3">
            <span className="text-sm font-medium text-gray-500">Total amount</span>
            <span className="text-lg font-bold text-[var(--whatsapp-accent)]">
              {formatCurrency(snapshot.subtotal + DEFAULT_DELIVERY_FEE)}
            </span>
          </div>
          <CustomerPrimaryButton type="submit">
            Continue to Payment · {formatCurrency(snapshot.subtotal + DEFAULT_DELIVERY_FEE)}
          </CustomerPrimaryButton>
        </form>
      }
    >
      <form className="space-y-3" onSubmit={handleContinue}>
        <CustomerCard>
          <CustomerSectionTitle>Delivery details</CustomerSectionTitle>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label htmlFor="name" className="text-xs font-medium text-gray-600">
                Name
              </label>
              <input
                id="name"
                value={form.name}
                onChange={(e) => updateField("name", e.target.value)}
                placeholder="Your full name"
                autoComplete="name"
                className={customerFieldClassName}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="phone" className="text-xs font-medium text-gray-600">
                Phone number
              </label>
              <input
                id="phone"
                type="tel"
                value={form.phone}
                onChange={(e) => updateField("phone", e.target.value)}
                placeholder="+91 98765 43210"
                autoComplete="tel"
                className={customerFieldClassName}
              />
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor="address"
                className="text-xs font-medium text-gray-600"
              >
                Delivery address
              </label>
              <textarea
                id="address"
                value={form.address}
                onChange={(e) => updateField("address", e.target.value)}
                placeholder="House no., street, city, pin code"
                rows={3}
                className={customerFieldClassName}
              />
            </div>
          </div>
          {error ? (
            <p className="mt-3 text-sm text-red-600">{error}</p>
          ) : null}
        </CustomerCard>

        <CustomerCard>
          <CustomerSectionTitle>Order summary</CustomerSectionTitle>
          <ul className="space-y-3">
            {snapshot.items.map((item) => (
              <li
                key={item.productId}
                className="flex items-center gap-3 text-sm"
              >
                <ProductImage
                  productId={item.productId}
                  name={item.product.name}
                  imageUrl={item.product.image_url}
                  size="xs"
                />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-gray-900">{item.product.name}</p>
                  <p className="text-xs text-gray-500">
                    Qty {item.quantity} · {formatCurrency(item.product.price)} each
                  </p>
                </div>
                <p className="shrink-0 font-semibold text-[var(--whatsapp-accent)]">
                  {formatCurrency(item.lineSubtotal)}
                </p>
              </li>
            ))}
          </ul>
        </CustomerCard>
      </form>
    </CustomerShell>
  );
}
