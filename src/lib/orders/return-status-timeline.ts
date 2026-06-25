export const RETURN_STATUS_INTENT_PREFIX = "return_status|";

export type ReturnWorkflowStatus =
  | "awaiting_reason"
  | "awaiting_photo"
  | "pending"
  | "approved"
  | "rejected"
  | "pickup_scheduled"
  | "picked_up"
  | "refunded";

export type ReturnTimelineStep = {
  key: ReturnWorkflowStatus | "submitted";
  label: string;
  description: string;
  timestamp: string | null;
  state: "completed" | "current" | "upcoming" | "failed";
};

const STATUS_LABELS: Record<ReturnWorkflowStatus, string> = {
  awaiting_reason: "Reason Needed",
  awaiting_photo: "Photo Needed",
  pending: "Pending Review",
  approved: "Approved",
  rejected: "Rejected",
  pickup_scheduled: "Pickup Scheduled",
  picked_up: "Picked Up",
  refunded: "Refunded",
};

export function formatReturnStatusLabel(status: string): string {
  return STATUS_LABELS[status as ReturnWorkflowStatus] ?? status.replace(/_/g, " ");
}

/** Customer-facing label on the return tracking page */
export function formatReturnTrackingStatusLabel(status: string): string {
  if (status === "refunded") return "Closed";
  return formatReturnStatusLabel(status);
}

export function encodeReturnStatusIntent(requestId: string, status: string): string {
  return `${RETURN_STATUS_INTENT_PREFIX}${requestId}|${status}`;
}

export function parseReturnStatusIntent(intent: string | null): {
  requestId: string;
  status: string;
} | null {
  if (!intent?.startsWith(RETURN_STATUS_INTENT_PREFIX)) return null;
  const payload = intent.slice(RETURN_STATUS_INTENT_PREFIX.length);
  const pipeIndex = payload.indexOf("|");
  if (pipeIndex <= 0) return null;
  const requestId = payload.slice(0, pipeIndex).trim();
  const status = payload.slice(pipeIndex + 1).trim();
  if (!requestId || !status) return null;
  return { requestId, status };
}

export function buildReturnTimeline(input: {
  status: ReturnWorkflowStatus;
  created_at: string;
  approved_at?: string | null;
  pickup_scheduled_at?: string | null;
  picked_up_at?: string | null;
  refunded_at?: string | null;
  rejected_at?: string | null;
}): ReturnTimelineStep[] {
  if (input.status === "rejected") {
    return [
      {
        key: "submitted",
        label: "Return Submitted",
        description: "Your return request was received.",
        timestamp: input.created_at,
        state: "completed",
      },
      {
        key: "pending",
        label: "Under Review",
        description: "Our team reviewed your request.",
        timestamp: input.created_at,
        state: "completed",
      },
      {
        key: "rejected",
        label: "Return Rejected",
        description: "This return request was not approved.",
        timestamp: input.rejected_at ?? input.created_at,
        state: "failed",
      },
    ];
  }

  const steps: Omit<ReturnTimelineStep, "state" | "timestamp">[] = [
    {
      key: "submitted",
      label: "Return Submitted",
      description: "Your return request was received.",
    },
    {
      key: "pending",
      label: "Under Review",
      description: "Our team is reviewing your request.",
    },
    {
      key: "approved",
      label: "Return Approved",
      description: "Your return has been approved.",
    },
    {
      key: "pickup_scheduled",
      label: "Pickup Scheduled",
      description: "A courier pickup has been scheduled.",
    },
    {
      key: "picked_up",
      label: "Items Picked Up",
      description: "Your return package has been collected.",
    },
    {
      key: "refunded",
      label: "Refund Processed",
      description: "Your refund has been successfully processed.",
    },
  ];

  const timestamps: Record<string, string | null> = {
    submitted: input.created_at,
    pending: input.created_at,
    approved: input.approved_at ?? null,
    pickup_scheduled: input.pickup_scheduled_at ?? null,
    picked_up: input.picked_up_at ?? null,
    refunded: input.refunded_at ?? null,
  };

  const statusOrder: (ReturnWorkflowStatus | "submitted")[] = [
    "submitted",
    "pending",
    "approved",
    "pickup_scheduled",
    "picked_up",
    "refunded",
  ];

  const currentIndex = statusOrder.indexOf(
    input.status === "awaiting_reason" || input.status === "awaiting_photo"
      ? "pending"
      : input.status,
  );

  return steps.map((step, index) => {
    let state: ReturnTimelineStep["state"] = "upcoming";
    if (index < currentIndex) state = "completed";
    else if (index === currentIndex) state = "current";
    if (input.status === "refunded" && step.key === "refunded") state = "completed";

    return {
      ...step,
      timestamp: timestamps[step.key] ?? null,
      state,
    };
  });
}

export function buildRefundProcessedMessage(input: {
  refundReference: string;
  refundAmount: number;
}): string {
  const amount = Math.round(input.refundAmount).toLocaleString("en-IN");

  return `✅ Refund Processed

Refund ID: ${input.refundReference}
Amount Refunded: ₹${amount}

Your refund has been successfully processed and issued to your original payment method. Depending on your bank or payment provider, it may take 3–7 business days to reflect in your account.

If you have any questions or need further assistance, our support team is happy to help.`;
}

export function buildReturnStatusUpdateMessage(input: {
  requestId: string;
  orderId: string;
  status: ReturnWorkflowStatus;
  pickupReference?: string | null;
  refundReference?: string | null;
  refundAmount?: number | null;
  rejectReason?: string | null;
}): string {
  if (
    input.status === "refunded" &&
    input.refundReference &&
    input.refundAmount != null
  ) {
    return buildRefundProcessedMessage({
      refundReference: input.refundReference,
      refundAmount: input.refundAmount,
    });
  }

  const orderRef = input.orderId.slice(0, 12);
  const label = formatReturnStatusLabel(input.status);

  const lines = [
    `Request: ${input.requestId}`,
    `Order: #${orderRef}`,
    `Status: ${label}`,
  ];

  if (input.status === "pickup_scheduled" && input.pickupReference) {
    lines.push(`Pickup Reference: ${input.pickupReference}`);
    lines.push("Our courier partner will contact you to collect the items.");
  }

  if (input.status === "picked_up") {
    lines.push("Your return package has been collected and is on its way to us.");
  }

  if (input.status === "rejected" && input.rejectReason) {
    lines.push(`Reason: ${input.rejectReason}`);
  }

  if (input.status === "approved") {
    lines.push("We will schedule a pickup for your return shortly.");
  }

  return lines.join("\n");
}

export const ADMIN_RETURN_SECTIONS = [
  { key: "pending", label: "Pending Returns" },
  { key: "approved", label: "Approved Returns" },
  { key: "pickup_scheduled", label: "Pickup Scheduled" },
  { key: "picked_up", label: "Picked Up" },
  { key: "refunded", label: "Refunded" },
] as const;

export type AdminReturnSection = (typeof ADMIN_RETURN_SECTIONS)[number]["key"];

export type ReturnAdminAction =
  | "approve"
  | "reject"
  | "schedule_pickup"
  | "mark_picked_up"
  | "process_refund";

export function getAvailableAdminActions(
  status: ReturnWorkflowStatus,
): ReturnAdminAction[] {
  switch (status) {
    case "pending":
      return ["approve", "reject"];
    case "approved":
      return ["schedule_pickup"];
    case "pickup_scheduled":
      return ["mark_picked_up"];
    case "picked_up":
      return ["process_refund"];
    default:
      return [];
  }
}

export const RETURN_ACTION_LABELS: Record<ReturnAdminAction, string> = {
  approve: "Approve Return",
  reject: "Reject Return",
  schedule_pickup: "Schedule Pickup",
  mark_picked_up: "Mark Picked Up",
  process_refund: "Process Refund",
};
