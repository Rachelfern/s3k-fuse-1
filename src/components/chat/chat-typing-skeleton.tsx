import { ChatTypingIndicator } from "@/components/chat/chat-typing-indicator";

export function ChatTypingSkeleton({ className }: { className?: string }) {
  return <ChatTypingIndicator className={className} />;
}
