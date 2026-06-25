"use client";

import {
  CHAT_STATUS_EVENT_SHELL,
  CHAT_STATUS_EVENT_THEMES,
  parseChatStatusEvent,
} from "@/lib/chat/status-event-card";
import { cn } from "@/lib/utils";

type ChatStatusEventCardProps = {
  intent: string | null;
  content: string;
  createdAt: string;
};

export function ChatStatusEventCard({
  intent,
  content,
  createdAt,
}: ChatStatusEventCardProps) {
  const event = parseChatStatusEvent({ intent, content, createdAt });
  const theme = CHAT_STATUS_EVENT_THEMES[event.variant];

  return (
    <div className={cn(CHAT_STATUS_EVENT_SHELL, theme.shell)}>
      <p className="chat-bubble-content whitespace-pre-wrap">{event.titleLine}</p>
      {event.detailBlock ? (
        <p className="chat-bubble-content mt-0.5 whitespace-pre-wrap">
          {event.detailBlock}
        </p>
      ) : null}
      {event.statusLine ? (
        <p className={cn("mt-0.5 font-medium", theme.statusTextClass)}>
          {event.statusLine}
        </p>
      ) : null}
      <p className="mt-0.5 text-gray-500">{event.timestamp}</p>
    </div>
  );
}
