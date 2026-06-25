"use client";

import { useEffect } from "react";
import { cn } from "@/lib/utils";

interface ToastProps {
  message: string;
  visible: boolean;
  onDismiss?: () => void;
  durationMs?: number;
  variant?: "default" | "warning";
}

export function Toast({
  message,
  visible,
  onDismiss,
  durationMs = 5000,
  variant = "default",
}: ToastProps) {
  useEffect(() => {
    if (!visible || !onDismiss) return;

    const timer = setTimeout(onDismiss, durationMs);
    return () => clearTimeout(timer);
  }, [visible, onDismiss, durationMs]);

  if (!visible) return null;

  return (
    <div
      role="status"
      className={cn(
        "fixed bottom-4 right-4 z-50 max-w-sm rounded-lg border px-4 py-3 text-sm shadow-lg",
        variant === "warning"
          ? "border-amber-200 bg-amber-50 text-amber-800"
          : "border-gray-200 bg-white text-gray-800",
      )}
    >
      {message}
    </div>
  );
}
