import {
  getRazorpayKeyIdFromEnv,
  getRazorpayKeySecretFromEnv,
  isRazorpayLiveReady,
} from "@/lib/payments/razorpay-config";
import { createHmac, timingSafeEqual } from "node:crypto";

const RAZORPAY_API_BASE = "https://api.razorpay.com/v1";

type RazorpayCredentials = {
  keyId: string;
  keySecret: string;
};

type RazorpayOrderResponse = {
  id: string;
  amount: number;
  currency: string;
  receipt?: string;
};

export function isRazorpayServerConfigured(): boolean {
  return isRazorpayLiveReady();
}

function getRazorpayCredentials(): RazorpayCredentials | null {
  const keyId = getRazorpayKeyIdFromEnv();
  const keySecret = getRazorpayKeySecretFromEnv();

  if (!keyId || !keySecret) {
    return null;
  }

  return { keyId, keySecret };
}

function getRazorpayAuthHeader(credentials: RazorpayCredentials): string {
  const token = Buffer.from(
    `${credentials.keyId}:${credentials.keySecret}`,
  ).toString("base64");
  return `Basic ${token}`;
}

export async function createRazorpayOrder(input: {
  amountPaise: number;
  receipt?: string;
  notes?: Record<string, string>;
}): Promise<RazorpayOrderResponse> {
  const credentials = getRazorpayCredentials();
  if (!credentials) {
    throw new Error("Razorpay is not configured on the server.");
  }

  if (!Number.isInteger(input.amountPaise) || input.amountPaise <= 0) {
    throw new Error("A valid amount is required.");
  }

  const response = await fetch(`${RAZORPAY_API_BASE}/orders`, {
    method: "POST",
    headers: {
      Authorization: getRazorpayAuthHeader(credentials),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: input.amountPaise,
      currency: "INR",
      receipt: input.receipt,
      notes: input.notes,
    }),
  });

  const body = (await response.json().catch(() => null)) as
    | RazorpayOrderResponse
    | { error?: { description?: string } }
    | null;

  if (!response.ok || !body || !("id" in body)) {
    const message =
      body && "error" in body
        ? body.error?.description ?? "Failed to create Razorpay order."
        : "Failed to create Razorpay order.";
    throw new Error(message);
  }

  return body;
}

export function verifyRazorpayPaymentSignature(input: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}): boolean {
  const credentials = getRazorpayCredentials();
  if (!credentials) {
    throw new Error("Razorpay is not configured on the server.");
  }

  const payload = `${input.razorpayOrderId}|${input.razorpayPaymentId}`;
  const expectedSignature = createHmac("sha256", credentials.keySecret)
    .update(payload)
    .digest("hex");

  const expected = Buffer.from(expectedSignature, "utf8");
  const received = Buffer.from(input.razorpaySignature, "utf8");

  if (expected.length !== received.length) {
    return false;
  }

  return timingSafeEqual(expected, received);
}
