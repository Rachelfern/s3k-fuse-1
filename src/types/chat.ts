export type ChatRole = "customer" | "assistant";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  productIds?: string[];
  quantities?: Record<string, number>;
  createdAt: string;
}
