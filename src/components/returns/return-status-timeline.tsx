"use client";

import { Check, X } from "lucide-react";
import {
  buildReturnTimeline,
  formatReturnStatusLabel,
  formatReturnTrackingStatusLabel,
  type ReturnTimelineStep,
  type ReturnWorkflowStatus,
} from "@/lib/orders/return-status-timeline";
import type { ReturnRequest } from "@/lib/types";
import { cn } from "@/lib/utils";

type StepState = ReturnTimelineStep["state"];

function StepCircle({ state }: { state: StepState }) {
  if (state === "completed") {
    return (
      <div className="flex size-6 items-center justify-center rounded-full bg-green-500 text-white">
        <Check className="size-3.5" strokeWidth={2.5} />
      </div>
    );
  }

  if (state === "failed") {
    return (
      <div className="flex size-6 items-center justify-center rounded-full bg-red-500 text-white">
        <X className="size-3.5" strokeWidth={2.5} />
      </div>
    );
  }

  if (state === "current") {
    return (
      <div className="flex size-6 items-center justify-center rounded-full bg-green-500 text-white ring-2 ring-green-500 ring-offset-1 animate-pulse">
        <span className="size-1.5 rounded-full bg-white" />
      </div>
    );
  }

  return (
    <div className="flex size-6 items-center justify-center rounded-full border-2 border-gray-200 bg-white">
      <span className="size-1.5 rounded-full bg-gray-200" />
    </div>
  );
}

function formatStepTime(iso: string | null): string | null {
  if (!iso) return null;
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  }).format(new Date(iso));
}

export function ReturnStatusTimeline({
  returnRequest,
  compact = false,
}: {
  returnRequest: Pick<
    ReturnRequest,
    | "id"
    | "status"
    | "created_at"
    | "approved_at"
    | "pickup_scheduled_at"
    | "picked_up_at"
    | "refunded_at"
    | "rejected_at"
    | "refund_reference"
  >;
  compact?: boolean;
}) {
  const steps = buildReturnTimeline({
    status: returnRequest.status as ReturnWorkflowStatus,
    created_at: returnRequest.created_at,
    approved_at: returnRequest.approved_at,
    pickup_scheduled_at: returnRequest.pickup_scheduled_at,
    picked_up_at: returnRequest.picked_up_at,
    refunded_at: returnRequest.refunded_at,
    rejected_at: returnRequest.rejected_at,
  });

  const isClosed = returnRequest.status === "refunded";
  const statusLabel = compact
    ? formatReturnStatusLabel(returnRequest.status)
    : formatReturnTrackingStatusLabel(returnRequest.status);

  return (
    <div className={cn("rounded-lg border border-gray-100 bg-white", compact ? "p-3" : "p-4")}>
      {!compact ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            Return Status
          </h3>
          <span
            className={cn(
              "max-w-full shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
              isClosed
                ? "bg-green-100 text-green-700"
                : "bg-gray-100 text-gray-600",
            )}
          >
            {statusLabel}
          </span>
        </div>
      ) : null}

      <div className="relative">
        {steps.map((step, index) => {
          const connectorCompleted =
            step.state === "completed" || step.state === "failed";

          return (
            <div
              key={step.key}
              className={cn("relative", index < steps.length - 1 ? "pb-5" : "")}
            >
              {index < steps.length - 1 ? (
                <div
                  className={cn(
                    "absolute left-[11px] top-6 h-[calc(100%-8px)] w-0.5",
                    connectorCompleted ? "bg-green-200" : "bg-gray-200",
                    step.state === "failed" && "bg-red-200",
                  )}
                  aria-hidden
                />
              ) : null}

              <div className="absolute left-0 top-0">
                <StepCircle state={step.state} />
              </div>

              <div className="ml-9 min-w-0">
                <p
                  className={cn(
                    compact ? "text-xs" : "text-sm",
                    step.state === "completed" && "font-medium text-gray-900",
                    step.state === "current" && "font-semibold text-green-600",
                    step.state === "failed" && "font-semibold text-red-600",
                    step.state === "upcoming" && "text-gray-400",
                  )}
                >
                  {step.label}
                </p>
                {!compact ? (
                  <p className="mt-0.5 text-xs text-gray-400">{step.description}</p>
                ) : null}
                {step.key === "refunded" && returnRequest.refund_reference ? (
                  <p className="mt-0.5 font-mono text-[10px] text-gray-500">
                    Refund ID: {returnRequest.refund_reference}
                  </p>
                ) : null}
                {step.timestamp ? (
                  <p className="mt-0.5 text-[10px] text-gray-400">
                    {formatStepTime(step.timestamp)}
                  </p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ReturnStatusChatCard({
  returnRequest,
}: {
  returnRequest: Pick<
    ReturnRequest,
    | "id"
    | "status"
    | "created_at"
    | "approved_at"
    | "pickup_scheduled_at"
    | "picked_up_at"
    | "refunded_at"
    | "rejected_at"
    | "refund_reference"
  >;
}) {
  return (
    <div className="mt-2 w-full">
      <ReturnStatusTimeline returnRequest={returnRequest} compact />
    </div>
  );
}
