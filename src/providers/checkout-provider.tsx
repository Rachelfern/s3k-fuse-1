"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  CheckoutDetails,
  CompletedOrder,
  PaymentDetails,
} from "@/types/checkout";
import { emptyCheckoutDetails } from "@/types/checkout";
import type { CartLineItem } from "@/types/cart";

interface CheckoutContextValue {
  checkoutDetails: CheckoutDetails;
  setCheckoutDetails: (details: CheckoutDetails) => void;
  completedOrder: CompletedOrder | null;
  completeOrder: (input: {
    checkout: CheckoutDetails;
    items: CartLineItem[];
    subtotal: number;
    payment: PaymentDetails;
    orderId?: string;
  }) => CompletedOrder;
  resetCheckout: () => void;
}

const CheckoutContext = createContext<CheckoutContextValue | null>(null);

function createOrderId() {
  return `ORD-${Date.now().toString(36).toUpperCase()}`;
}

export function CheckoutProvider({ children }: { children: ReactNode }) {
  const [checkoutDetails, setCheckoutDetailsState] =
    useState<CheckoutDetails>(emptyCheckoutDetails);
  const [completedOrder, setCompletedOrder] = useState<CompletedOrder | null>(
    null
  );

  const setCheckoutDetails = useCallback((details: CheckoutDetails) => {
    setCheckoutDetailsState(details);
  }, []);

  const completeOrder = useCallback(
    (input: {
      checkout: CheckoutDetails;
      items: CartLineItem[];
      subtotal: number;
      payment: PaymentDetails;
      orderId?: string;
    }): CompletedOrder => {
      const order: CompletedOrder = {
        orderId: input.orderId ?? createOrderId(),
        placedAt: new Date().toISOString(),
        checkout: input.checkout,
        items: input.items,
        subtotal: input.subtotal,
        payment: input.payment,
      };
      setCompletedOrder(order);
      return order;
    },
    []
  );

  const resetCheckout = useCallback(() => {
    setCheckoutDetailsState(emptyCheckoutDetails);
  }, []);

  const value = useMemo(
    () => ({
      checkoutDetails,
      setCheckoutDetails,
      completedOrder,
      completeOrder,
      resetCheckout,
    }),
    [
      checkoutDetails,
      setCheckoutDetails,
      completedOrder,
      completeOrder,
      resetCheckout,
    ]
  );

  return (
    <CheckoutContext.Provider value={value}>{children}</CheckoutContext.Provider>
  );
}

export function useCheckout(): CheckoutContextValue {
  const context = useContext(CheckoutContext);
  if (!context) {
    throw new Error("useCheckout must be used within CheckoutProvider");
  }
  return context;
}
