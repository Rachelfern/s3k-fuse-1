"use client";

import { useCallback, useEffect, useState } from "react";

export type AiStatus = "loading" | "ready" | "offline";

export function useAiStatus(enabled = true) {
  const [status, setStatus] = useState<AiStatus>("loading");

  const checkAi = useCallback(async () => {
    if (!enabled) return;

    setStatus((current) => (current === "ready" ? "ready" : "loading"));

    try {
      const response = await fetch("/api/ai/warmup");
      const data = (await response.json()) as { ready?: boolean };

      setStatus(data.ready ? "ready" : "offline");
    } catch {
      setStatus("offline");
    }
  }, [enabled]);

  useEffect(() => {
    void checkAi();
  }, [checkAi]);

  return { status, checkAi };
}

export function getAiStatusLabel(status: AiStatus): string {
  switch (status) {
    case "ready":
      return "🟢 AI Ready";
    case "loading":
      return "🟡 AI Loading…";
    case "offline":
      return "🔴 AI Offline";
  }
}
