import type { ChatMessage } from "@/types/chat";
import type { CartSnapshot } from "@/types/cart";
import {
  formatAddedConfirmation,
  formatCartReply,
  formatCartUpdateConfirmation,
  type CartUpdateAction,
} from "@/lib/cart-utils";
import { mockProducts } from "@/lib/mock/products";

export const WELCOME_MESSAGE = `Hello! Welcome to S3K Commerce 👋

I can help you:
• Browse products
• Build your cart
• Track orders
• Get recommendations

Type a message to get started.`;

export const WELCOME_MESSAGE_ID = "msg-welcome";

export function getInitialMessages(): ChatMessage[] {
  return [
    {
      id: WELCOME_MESSAGE_ID,
      role: "assistant",
      content: WELCOME_MESSAGE,
      createdAt: "",
    },
  ];
}

const GREETING_PATTERN =
  /^(hi|hello|hey|good morning|good afternoon|good evening)\b/i;

const PRODUCT_PATTERN =
  /\b(menu|products?|recommend(?:ation)?s?|browse|catalog|show me|what(?:'s| is) available|what do you (?:have|sell|offer))\b/i;

const CART_PATTERN =
  /^(?:view|show|see|check|open)\s+(?:my\s+)?cart$|^(?:my\s+)?cart$|^what(?:'s| is) in my cart\??$/i;

const ADD_PATTERN = /^add\s+(.+)/i;

const menuProductIds = mockProducts.map((p) => p.id);

export type CartMutation =
  | { type: "add"; productId: string }
  | { type: "increment"; productId: string }
  | { type: "decrement"; productId: string };

export interface AssistantReplyResult {
  reply: Omit<ChatMessage, "id" | "createdAt">;
  cartMutation?: CartMutation;
  addedProductName?: string;
}

function findProductByName(text: string) {
  const lower = text.toLowerCase();
  return mockProducts.find((p) => lower.includes(p.name.toLowerCase()));
}

export function resolveAssistantReply(
  input: string,
  cart: CartSnapshot
): AssistantReplyResult {
  const trimmed = input.trim();

  if (GREETING_PATTERN.test(trimmed)) {
    return {
      reply: {
        role: "assistant",
        content: `Welcome! Great to hear from you. Here's what I can help with:

• Browse our menu — type "menu"
• Build your cart — type "add [item name]"
• View your cart — type "my cart"
• Get recommendations — type "recommendations"

What would you like to do?`,
      },
    };
  }

  if (CART_PATTERN.test(trimmed)) {
    return {
      reply: {
        role: "assistant",
        content: formatCartReply(cart),
      },
    };
  }

  const addMatch = trimmed.match(ADD_PATTERN);
  if (addMatch) {
    const product = findProductByName(addMatch[1]);
    if (product) {
      return {
        reply: {
          role: "assistant",
          content: "",
        },
        cartMutation: { type: "add", productId: product.id },
        addedProductName: product.name,
      };
    }
    return {
      reply: {
        role: "assistant",
        content: `I couldn't find "${addMatch[1]}" on the menu. Type "menu" to see available products.`,
      },
    };
  }

  if (PRODUCT_PATTERN.test(trimmed)) {
    return {
      reply: {
        role: "assistant",
        content:
          "Here are some popular items from our menu. Tap Add to cart on anything you'd like:",
        productIds: menuProductIds,
      },
    };
  }

  return {
    reply: {
      role: "assistant",
      content: `I'm here to help with your order. Try "menu" to browse, "add [item name]" to add something, or "my cart" to view your cart.`,
    },
  };
}

export function buildProductAddedMessage(
  productName: string,
  snapshot: CartSnapshot
): string {
  return formatAddedConfirmation(productName, snapshot);
}

export function buildCartUpdateMessage(
  productName: string,
  snapshot: CartSnapshot,
  action: CartUpdateAction
): string {
  return formatCartUpdateConfirmation(productName, snapshot, action);
}

export function buildOrderSuccessMessage(
  orderId: string,
  total: number
): string {
  const formattedTotal = new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 0,
  }).format(total);

  return `✅ Your order has been placed successfully.
Order ID: ${orderId}
Total: ₹${formattedTotal}

Can I help you with anything else?`;
}
