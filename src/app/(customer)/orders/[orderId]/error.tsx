"use client";

import { CommerceRouteError } from "@/components/error/commerce-error-boundary";

export default function OrderTrackingError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <CommerceRouteError
      error={error}
      reset={reset}
      pageTitle="Order Tracking"
    />
  );
}
