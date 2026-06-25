"use client";

import { useEffect, useRef, useState } from "react";
import type {
  RealtimeChannel,
  RealtimePostgresChangesPayload,
} from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

export type RealtimeConnectionStatus =
  | "connecting"
  | "connected"
  | "disconnected"
  | "unavailable";

const DEFAULT_MAX_RETRIES = 4;

interface RealtimeSubscriptionOptions {
  channelName: string;
  table: string;
  schema?: string;
  event?: "*" | "INSERT" | "UPDATE" | "DELETE";
  enabled?: boolean;
  maxRetries?: number;
  onEvent: (
    payload: RealtimePostgresChangesPayload<{ [key: string]: unknown }>,
  ) => void;
}

function getBackoffMs(retryCount: number): number {
  return Math.min(1000 * 2 ** (retryCount - 1), 8000);
}

export function getRealtimeStatusLabel(status: RealtimeConnectionStatus): string {
  switch (status) {
    case "connected":
      return "Realtime Connected";
    case "connecting":
      return "Connecting…";
    case "disconnected":
      return "Realtime Disconnected";
    case "unavailable":
      return "Realtime Unavailable";
  }
}

export function useRealtimeSubscription({
  channelName,
  table,
  schema = "public",
  event = "*",
  enabled = true,
  maxRetries = DEFAULT_MAX_RETRIES,
  onEvent,
}: RealtimeSubscriptionOptions) {
  const [status, setStatus] =
    useState<RealtimeConnectionStatus>("connecting");
  const onEventRef = useRef(onEvent);
  const retryCountRef = useRef(0);

  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    if (!enabled) {
      setStatus("unavailable");
      return;
    }

    const supabase = createClient();
    let channel: RealtimeChannel | null = null;
    let retryTimeout: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    const cleanupChannel = () => {
      if (channel) {
        void supabase.removeChannel(channel);
        channel = null;
      }
    };

    const scheduleRetry = () => {
      if (cancelled) return;

      retryCountRef.current += 1;

      if (retryCountRef.current > maxRetries) {
        setStatus("unavailable");
        return;
      }

      setStatus("disconnected");
      const delay = getBackoffMs(retryCountRef.current);

      retryTimeout = setTimeout(() => {
        if (!cancelled) {
          setStatus("connecting");
          subscribe();
        }
      }, delay);
    };

    const subscribe = () => {
      cleanupChannel();

      channel = supabase
        .channel(channelName)
        .on(
          "postgres_changes",
          { event, schema, table },
          (payload) => {
            onEventRef.current(payload);
          },
        )
        .subscribe((subscriptionStatus, err) => {
          if (cancelled) return;

          if (subscriptionStatus === "SUBSCRIBED") {
            retryCountRef.current = 0;
            setStatus("connected");
            return;
          }

          if (
            subscriptionStatus === "CHANNEL_ERROR" ||
            subscriptionStatus === "TIMED_OUT"
          ) {
            if (process.env.NODE_ENV === "development") {
              console.warn(
                `[realtime:${channelName}] ${subscriptionStatus}`,
                err?.message,
              );
            }
            scheduleRetry();
            return;
          }

          if (subscriptionStatus === "CLOSED") {
            setStatus("disconnected");
          }
        });
    };

    subscribe();

    return () => {
      cancelled = true;
      if (retryTimeout) clearTimeout(retryTimeout);
      cleanupChannel();
    };
  }, [channelName, table, schema, event, enabled, maxRetries]);

  return { status };
}
