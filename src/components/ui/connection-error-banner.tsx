"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const DEFAULT_MAX_RETRIES = 4;

function getBackoffMs(retryCount: number): number {
  return Math.min(1000 * 2 ** (retryCount - 1), 8000);
}

interface ConnectionErrorBannerProps {
  message?: string;
  onRetry: () => void;
  autoRetry?: boolean;
  maxRetries?: number;
  exhaustedMessage?: string;
}

export function ConnectionErrorBanner({
  message = "Failed to load data",
  onRetry,
  autoRetry = true,
  maxRetries = DEFAULT_MAX_RETRIES,
  exhaustedMessage = "Unable to load data. Please refresh the page or try again later.",
}: ConnectionErrorBannerProps) {
  const [retryCount, setRetryCount] = useState(0);
  const [exhausted, setExhausted] = useState(false);
  const onRetryRef = useRef(onRetry);

  useEffect(() => {
    onRetryRef.current = onRetry;
  }, [onRetry]);

  const attemptRetry = useCallback(() => {
    setRetryCount((current) => {
      if (current >= maxRetries) {
        return maxRetries + 1;
      }
      return current + 1;
    });
  }, [maxRetries]);

  useEffect(() => {
    if (retryCount === 0) return;

    if (retryCount > maxRetries) {
      setExhausted(true);
      return;
    }

    onRetryRef.current();
  }, [retryCount, maxRetries]);

  useEffect(() => {
    if (!autoRetry || exhausted || retryCount > maxRetries) return;

    const delay = getBackoffMs(retryCount + 1);
    const timer = setTimeout(() => {
      attemptRetry();
    }, delay);

    return () => clearTimeout(timer);
  }, [autoRetry, exhausted, retryCount, attemptRetry, maxRetries]);

  if (exhausted || retryCount > maxRetries) {
    return (
      <div
        role="alert"
        className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800"
      >
        <p className="font-medium">{exhaustedMessage}</p>
        <button
          type="button"
          onClick={() => {
            setExhausted(false);
            setRetryCount(0);
            onRetryRef.current();
          }}
          className="mt-2 text-xs font-medium underline hover:no-underline"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div
      role="alert"
      className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
    >
      {message}
      {autoRetry && retryCount > 0
        ? ` — retrying (${retryCount}/${maxRetries})…`
        : null}
    </div>
  );
}

interface RealtimeUnavailableBannerProps {
  onRetry?: () => void;
}

export function RealtimeUnavailableBanner({
  onRetry,
}: RealtimeUnavailableBannerProps) {
  return (
    <div
      role="status"
      className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
    >
      <p className="font-medium">
        Realtime updates unavailable. Dashboard data is still available.
      </p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-1 text-xs font-medium underline hover:no-underline"
        >
          Reconnect
        </button>
      ) : null}
    </div>
  );
}
