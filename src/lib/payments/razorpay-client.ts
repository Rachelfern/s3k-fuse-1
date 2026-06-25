import { isValidRazorpayKeyId } from "@/lib/payments/razorpay-config";

export type PaymentMethod = "upi" | "card" | "cod";

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayCheckoutOptions) => RazorpayInstance;
  }
}

type RazorpayCheckoutOptions = {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description?: string;
  order_id?: string;
  handler: (response: RazorpaySuccessResponse) => void;
  modal?: { ondismiss?: () => void };
  prefill?: { name?: string; email?: string; contact?: string };
  theme?: { color?: string };
};

type RazorpayInstance = {
  open: () => void;
  on: (event: string, handler: () => void) => void;
};

export type RazorpaySuccessResponse = {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
};

const RAZORPAY_SCRIPT = "https://checkout.razorpay.com/v1/checkout.js";

export function isRazorpayConfigured(): boolean {
  return isValidRazorpayKeyId(process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID);
}

export function getRazorpayKeyId(): string | undefined {
  const keyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID?.trim();
  return isValidRazorpayKeyId(keyId) ? keyId : undefined;
}

export async function fetchRazorpayServerStatus(): Promise<{
  razorpayReady: boolean;
}> {
  const response = await fetch("/api/payment/status");
  const body = (await response.json().catch(() => null)) as {
    razorpayReady?: boolean;
  } | null;

  return { razorpayReady: Boolean(body?.razorpayReady) };
}

export async function loadRazorpayScript(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (window.Razorpay) return true;

  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = RAZORPAY_SCRIPT;
    script.async = true;
    script.onload = () => resolve(Boolean(window.Razorpay));
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export async function createPaymentOrder(input: {
  amountPaise: number;
  receipt?: string;
}): Promise<{ orderId: string }> {
  const response = await fetch("/api/payment/create-order", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  const body = (await response.json().catch(() => null)) as {
    orderId?: string;
    error?: string;
  } | null;

  if (!response.ok || !body?.orderId) {
    throw new Error(body?.error ?? "Failed to create payment order.");
  }

  return { orderId: body.orderId };
}

export async function verifyPayment(input: RazorpaySuccessResponse): Promise<void> {
  const response = await fetch("/api/payment/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      razorpayOrderId: input.razorpay_order_id,
      razorpayPaymentId: input.razorpay_payment_id,
      razorpaySignature: input.razorpay_signature,
    }),
  });

  const body = (await response.json().catch(() => null)) as {
    verified?: boolean;
    error?: string;
  } | null;

  if (!response.ok || !body?.verified) {
    throw new Error(body?.error ?? "Payment verification failed.");
  }
}

export async function openRazorpayCheckout(input: {
  amountPaise: number;
  customerName: string;
  customerPhone: string;
  description: string;
  razorpayOrderId: string;
}): Promise<RazorpaySuccessResponse> {
  const key = getRazorpayKeyId();
  if (!key) {
    throw new Error("Razorpay is not configured.");
  }

  const loaded = await loadRazorpayScript();
  if (!loaded || !window.Razorpay) {
    throw new Error("Could not load Razorpay checkout.");
  }

  return new Promise((resolve, reject) => {
    const checkout = new window.Razorpay!({
      key,
      amount: input.amountPaise,
      currency: "INR",
      name: "S3K Commerce",
      description: input.description,
      order_id: input.razorpayOrderId,
      prefill: {
        name: input.customerName,
        contact: input.customerPhone,
      },
      theme: { color: "#128c7e" },
      handler: (response) => resolve(response),
      modal: {
        ondismiss: () => reject(new Error("Payment cancelled.")),
      },
    });

    checkout.on("payment.failed", () => {
      reject(new Error("Payment failed. Please try again."));
    });

    checkout.open();
  });
}
