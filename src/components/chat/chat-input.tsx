"use client";

import { Send } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

function createMessageId() {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

interface ChatInputProps {
  onSend: (text: string, messageId: string) => void;
  disabled?: boolean;
  className?: string;
}

export function ChatInput({ onSend, disabled, className }: ChatInputProps) {
  const [text, setText] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed, createMessageId());
    setText("");
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={cn(
        "flex w-full min-w-0 shrink-0 items-end gap-1.5 border-t border-black/5 bg-[#f0f0f0] px-2 py-1.5 md:px-4 lg:px-6 safe-bottom",
        className
      )}
    >
      <Input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Message"
        disabled={disabled}
        className="mb-0.5 min-w-0 flex-1 rounded-full border-none bg-white px-3.5 py-2 text-[15px] leading-tight shadow-sm focus-visible:ring-[#128c7e]/40"
        autoComplete="off"
      />
      <Button
        type="submit"
        size="icon"
        disabled={disabled || !text.trim()}
        className="mb-0.5 size-9 shrink-0 rounded-full bg-[#128c7e] hover:bg-[#075e54]"
        aria-label="Send message"
      >
        <Send className="size-4" />
      </Button>
    </form>
  );
}
