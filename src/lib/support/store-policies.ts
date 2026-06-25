import { STORE_NAME } from "@/lib/brand";

/** Configured store policies — update here to change chat responses. */
export const STORE_POLICIES = {
  returnPolicy: `Return Policy — ${STORE_NAME}

• Fresh produce and dairy: report quality issues within 24 hours of delivery (include a photo if possible).
• Unopened packaged goods: eligible for return within 7 days if damaged, expired, or incorrect.
• Perishable items cannot be returned once accepted unless spoiled on arrival.
• To start a return, reply with your order ID and a brief description of the issue.

Our team will review and confirm next steps within 1 business day.`,

  refundPolicy: `Refund Policy — ${STORE_NAME}

• Approved returns are refunded to your original payment method within 5–7 business days.
• Partial refunds may apply for opened or partially used non-perishable items.
• UPI/bank refunds may take an extra 1–2 days depending on your bank.
• If payment was verified manually, we will confirm the refund UTR once processed.

Reply with your order ID to check refund status on a specific order.`,

  generalSupport: `How can we help?

I can assist with products, orders, delivery, returns, and refunds — all right here in chat.

For urgent order issues, reply with your order ID and we'll look into it right away.`,

  returnEligibility: `Eligible returns: quality issues within 24 hours for fresh items; unopened packaged goods within 7 days if damaged or incorrect.`,
} as const;

export type SupportPolicyKind = keyof typeof STORE_POLICIES;

export function getSupportPolicyMessage(kind: SupportPolicyKind): string {
  return STORE_POLICIES[kind];
}
