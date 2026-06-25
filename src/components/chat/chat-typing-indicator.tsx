import { cn } from "@/lib/utils";

interface ChatTypingIndicatorProps {
  className?: string;
}

export function ChatTypingIndicator({ className }: ChatTypingIndicatorProps) {
  return (
    <div
      className={cn("chat-row-incoming", className)}
      aria-label="Assistant is typing"
      role="status"
    >
      <div className="chat-bubble-max w-fit rounded-[18px_18px_18px_4px] bg-white px-3 py-2 shadow-sm">
        <div className="flex items-center gap-1">
          {[0, 1, 2].map((index) => (
            <span
              key={index}
              className="typing-dot size-2 rounded-full bg-gray-400"
              style={{ animationDelay: `${index * 150}ms` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
