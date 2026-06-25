import type { MockProduct } from "@/lib/mock/products";

export interface CartLineItem {
  productId: string;
  product: MockProduct;
  quantity: number;
  lineSubtotal: number;
}

export interface CartSnapshot {
  items: CartLineItem[];
  itemCount: number;
  subtotal: number;
}
