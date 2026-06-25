"use client";

import {
  getQuickRepliesForMessage,
  resolveQuickReplyAction,
  type QuickReply,
} from "@/lib/chat/quick-replies";
import { cn } from "@/lib/utils";

interface QuickReplyChipsProps {
  intent: string | null;
  content?: string | null;
  disabled?: boolean;
  onSelect: (message: string) => void;
  onNavigate?: (href: string) => void;
  className?: string;
}

function handleReplyClick(
  reply: QuickReply,
  onSelect: (message: string) => void,
  onNavigate?: (href: string) => void,
) {
  const action = resolveQuickReplyAction(reply);
  if (action.type === "navigate" && action.href) {
    onNavigate?.(action.href);
    return;
  }
  onSelect(action.message ?? reply.label);
}

export function QuickReplyChips({
  intent,
  content,
  disabled = false,
  onSelect,
  onNavigate,
  className,
}: QuickReplyChipsProps) {
  const replies = getQuickRepliesForMessage({ intent, content });

  if (replies.length === 0) return null;

  return (
    <div className={cn("mt-1.5 flex flex-wrap gap-1", className)}>
      {replies.map((reply) => (
        <button
          key={`${intent}-${reply.label}`}
          type="button"
          disabled={disabled}
          onClick={() => handleReplyClick(reply, onSelect, onNavigate)}
          className={cn(
            "rounded-full border border-[#128c7e]/40 bg-white px-2.5 py-0.5 text-[11px] font-medium leading-tight text-[#075e54] shadow-sm transition-colors hover:bg-[#ecfdf5]",
            disabled && "cursor-not-allowed opacity-50",
          )}
        >
          {reply.label}
        </button>
      ))}
    </div>
  );
}
