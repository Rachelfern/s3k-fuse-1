import type { CartLineItem } from "@/types/cart";

export interface CheckoutDetails {
  name: string;
  phone: string;
  address: string;
}

export interface PaymentDetails {
  upiId: string;
  transactionReference: string;
}

export interface CompletedOrder {
  orderId: string;
  placedAt: string;
  checkout: CheckoutDetails;
  items: CartLineItem[];
  subtotal: number;
  payment: PaymentDetails;
}

export const emptyCheckoutDetails: CheckoutDetails = {
  name: "",
  phone: "",
  address: "",
};
