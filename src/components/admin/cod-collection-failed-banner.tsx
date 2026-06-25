"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface CodCollectionFailedBannerProps {
  delivered: boolean;
  customerId: string | null;
  onMarkCollected: () => void;
  onRescheduleCollection: () => void;
  onCancelOrder: () => void;
  busy?: boolean;
  className?: string;
}

export function CodCollectionFailedBanner({
  delivered,
  customerId,
  onMarkCollected,
  onRescheduleCollection,
  onCancelOrder,
  busy = false,
  className,
}: CodCollectionFailedBannerProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-amber-300 bg-amber-50 p-4",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-700" />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-amber-950">
            ⚠ COD Payment Not Collected
          </h3>
          <p className="mt-1 text-sm text-amber-900/90">
            The courier was unable to collect payment from the customer.
          </p>
          {delivered ? (
            <p className="mt-2 text-xs font-medium text-amber-800">
              Shipment is marked delivered, but this order is not complete until
              payment is resolved.
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              disabled={busy}
              onClick={onMarkCollected}
              className="bg-green-600 hover:bg-green-700"
            >
              Mark Collected
            </Button>
            {customerId ? (
              <Button type="button" size="sm" variant="outline" asChild>
                <Link href={`/admin/chats/${customerId}`}>Contact Customer</Link>
              </Button>
            ) : (
              <Button type="button" size="sm" variant="outline" disabled>
                Contact Customer
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={onRescheduleCollection}
              className="border-amber-300 bg-white text-amber-950 hover:bg-amber-100/60"
            >
              Reschedule Collection
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={onCancelOrder}
              className="border-red-200 text-red-700 hover:bg-red-50"
            >
              Cancel Order
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
