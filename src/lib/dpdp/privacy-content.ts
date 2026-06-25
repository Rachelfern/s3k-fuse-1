import { STORE_NAME } from "@/lib/brand";

export const PRIVACY_CONTACT_EMAIL =
  process.env.NEXT_PUBLIC_PRIVACY_CONTACT_EMAIL ?? "privacy@s3kcommerce.com";

export const PRIVACY_CONTACT_PHONE =
  process.env.NEXT_PUBLIC_PRIVACY_CONTACT_PHONE ?? "+91 1800-000-0000";

export const privacySections = [
  {
    title: "What data we collect",
    items: [
      "Your name and phone number",
      "Delivery address for order fulfilment",
      "Chat messages with our support team and AI assistant",
      "Order history, cart contents, and payment references (UPI/transaction IDs — not full card numbers)",
    ],
  },
  {
    title: "Why we collect it",
    items: [
      "To process and deliver your orders",
      "To provide customer support through chat",
      "To improve your shopping experience and product recommendations",
      "To comply with applicable laws and resolve disputes",
    ],
  },
  {
    title: "Retention policy",
    items: [
      "Account and profile data is retained while you use our services.",
      "Order records are kept for up to 7 years for tax and legal compliance.",
      "Chat history is retained for up to 2 years unless you request earlier deletion.",
      "After a verified deletion request, personal data is removed or anonymised within 30 days.",
    ],
  },
  {
    title: "Contact us",
    items: [
      `Email: ${PRIVACY_CONTACT_EMAIL}`,
      `Phone: ${PRIVACY_CONTACT_PHONE}`,
      `Business: ${STORE_NAME}`,
    ],
  },
  {
    title: "Data deletion requests",
    items: [
      "Go to Manage My Data in your account settings and tap Request Data Deletion.",
      "We will review your request and confirm by email within 7 business days.",
      "You may also email us directly at the address above with your registered phone number.",
      "Some order records may be retained in anonymised form where required by law.",
    ],
  },
] as const;
