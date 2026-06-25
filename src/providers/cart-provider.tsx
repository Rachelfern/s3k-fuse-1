"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  addProductToCart,
  applyCartUpdatesToItems,
  computeCartSnapshot,
  decrementProduct,
  incrementProduct,
} from "@/lib/cart-utils";
import type { ResolvedCartUpdate } from "@/types/ai";
import type { CartLineItem, CartSnapshot } from "@/types/cart";
import type { CartActionType } from "@/lib/chat/cart-action-messages";

export type CartMutationNotice = {
  productId: string;
  productName: string;
  action: CartActionType;
  previousQuantity: number;
  newQuantity: number;
  unitPrice: number;
  cartTotal: number;
  removedQuantity?: number;
  at: number;
};

interface CartContextValue {
  snapshot: CartSnapshot;
  getQuantity: (productId: string) => number;
  addItem: (productId: string) => CartSnapshot;
  incrementItem: (productId: string) => CartSnapshot;
  decrementItem: (productId: string) => CartSnapshot;
  applyCartUpdates: (updates: ResolvedCartUpdate[]) => CartSnapshot;
  clearCart: (options?: { announce?: boolean }) => void;
  lastMutation: CartMutationNotice | null;
  recordCartMutation: (
    mutation: Omit<CartMutationNotice, "at">,
  ) => void;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartLineItem[]>([]);
  const [lastMutation, setLastMutation] = useState<CartMutationNotice | null>(
    null,
  );
  const itemsRef = useRef<CartLineItem[]>(items);
  itemsRef.current = items;

  const snapshot = useMemo(() => computeCartSnapshot(items), [items]);

  const recordCartMutation = useCallback(
    (mutation: Omit<CartMutationNotice, "at">) => {
      setLastMutation({ ...mutation, at: Date.now() });
    },
    [],
  );

  const applyItems = useCallback(
    (nextItems: CartLineItem[]): CartSnapshot => {
      const nextSnapshot = computeCartSnapshot(nextItems);
      itemsRef.current = nextItems;
      setItems(nextItems);
      return nextSnapshot;
    },
    []
  );

  const addItem = useCallback(
    (productId: string): CartSnapshot => {
      const nextItems = addProductToCart(itemsRef.current, productId);
      return applyItems(nextItems);
    },
    [applyItems]
  );

  const incrementItem = useCallback(
    (productId: string): CartSnapshot => {
      const nextItems = incrementProduct(itemsRef.current, productId);
      return applyItems(nextItems);
    },
    [applyItems]
  );

  const decrementItem = useCallback(
    (productId: string): CartSnapshot => {
      const nextItems = decrementProduct(itemsRef.current, productId);
      return applyItems(nextItems);
    },
    [applyItems]
  );

  const applyCartUpdates = useCallback(
    (updates: ResolvedCartUpdate[]): CartSnapshot => {
      if (updates.length === 0) return computeCartSnapshot(itemsRef.current);
      const nextItems = applyCartUpdatesToItems(itemsRef.current, updates);
      return applyItems(nextItems);
    },
    [applyItems]
  );

  const clearCart = useCallback((options?: { announce?: boolean }) => {
    const previousTotal = computeCartSnapshot(itemsRef.current).subtotal;
    itemsRef.current = [];
    setItems([]);

    if (options?.announce && previousTotal > 0) {
      setLastMutation({
        productId: "",
        productName: "",
        action: "clear",
        previousQuantity: 0,
        newQuantity: 0,
        unitPrice: 0,
        cartTotal: 0,
        at: Date.now(),
      });
    } else {
      setLastMutation(null);
    }
  }, []);

  const getQuantity = useCallback(
    (productId: string) =>
      itemsRef.current.find((item) => item.productId === productId)?.quantity ??
      0,
    []
  );

  const value = useMemo(
    () => ({
      snapshot,
      getQuantity,
      addItem,
      incrementItem,
      decrementItem,
      applyCartUpdates,
      clearCart,
      lastMutation,
      recordCartMutation,
    }),
    [
      snapshot,
      getQuantity,
      addItem,
      incrementItem,
      decrementItem,
      applyCartUpdates,
      clearCart,
      lastMutation,
      recordCartMutation,
    ],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used within CartProvider");
  }
  return context;
}
