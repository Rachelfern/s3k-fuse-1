import { clearChatStateCache } from "@/lib/chat/chat-state-cache";

export const VAARTA_KEYS = {
  name: "vaarta_name",
  phone: "vaarta_phone",
  customerId: "vaarta_customer_id",
  address: "vaarta_address",
  conversationId: "vaarta_conversation_id",
} as const;

export interface CustomerSession {
  customerId: string;
  conversationId: string;
  customerName: string;
  phone: string;
}

export function generatePhone() {
  return "98" + Math.floor(10000000 + Math.random() * 90000000);
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export function getCustomerSession(): Partial<CustomerSession> {
  if (typeof window === "undefined") return {};
  return {
    customerId: localStorage.getItem(VAARTA_KEYS.customerId) ?? undefined,
    conversationId: localStorage.getItem(VAARTA_KEYS.conversationId) ?? undefined,
    customerName: localStorage.getItem(VAARTA_KEYS.name) ?? undefined,
    phone: localStorage.getItem(VAARTA_KEYS.phone) ?? undefined,
  };
}

export function getVaartaAddress(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return localStorage.getItem(VAARTA_KEYS.address) ?? undefined;
}

export function saveCustomerSession(session: CustomerSession) {
  localStorage.setItem(VAARTA_KEYS.customerId, session.customerId);
  localStorage.setItem(VAARTA_KEYS.conversationId, session.conversationId);
  localStorage.setItem(VAARTA_KEYS.name, session.customerName);
  localStorage.setItem(VAARTA_KEYS.phone, session.phone);
}

export function saveVaartaProfile(data: {
  name?: string;
  phone?: string;
  customerId?: string;
  address?: string;
}) {
  if (data.name !== undefined) {
    localStorage.setItem(VAARTA_KEYS.name, data.name);
  }
  if (data.phone !== undefined) {
    localStorage.setItem(VAARTA_KEYS.phone, data.phone);
  }
  if (data.customerId !== undefined) {
    localStorage.setItem(VAARTA_KEYS.customerId, data.customerId);
  }
  if (data.address !== undefined) {
    localStorage.setItem(VAARTA_KEYS.address, data.address);
  }
}

export function clearCustomerSession() {
  Object.values(VAARTA_KEYS).forEach((key) => localStorage.removeItem(key));
  clearChatStateCache();
}
