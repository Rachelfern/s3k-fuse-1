"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Download, Info, Trash2 } from "lucide-react";
import {
  CustomerCard,
  CustomerPrimaryButton,
  CustomerSectionTitle,
  CustomerShell,
} from "@/components/customer/customer-shell";
import {
  getCustomerSession,
  isValidUuid,
} from "@/lib/chat/customer-storage";
import type { NewDataSummary } from "@/lib/dpdp/dataset-state";
import { resetLocalCustomerJourneyAfterDeletion } from "@/lib/dpdp/reset-local-journey";
import { diagnoseSupabaseError } from "@/lib/supabase/errors";

type ActionState = "idle" | "loading" | "success" | "error";

type ProfileState = {
  effectiveStatus: string;
  lastDeletedAt: string | null;
  hasNewPersonalData: boolean;
  newDataSinceDeletion: NewDataSummary | null;
};

function formatDeletedAt(iso: string | null): string {
  if (!iso) return "recently";
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

function describeNewData(summary: NewDataSummary | null): string {
  if (!summary || summary.totalItems === 0) return "no new personal data";

  const parts: string[] = [];
  if (summary.messageCount > 0) {
    parts.push(
      `${summary.messageCount} chat message${summary.messageCount === 1 ? "" : "s"}`,
    );
  }
  if (summary.orderCount > 0) {
    parts.push(
      `${summary.orderCount} order${summary.orderCount === 1 ? "" : "s"}`,
    );
  }
  if (summary.hasProfilePii || summary.hasConsent) {
    parts.push("profile or consent records");
  }

  return parts.join(", ");
}

export default function MyDataPage() {
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileState | null>(null);
  const [exportState, setExportState] = useState<ActionState>("idle");
  const [deletionState, setDeletionState] = useState<ActionState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isDeleted = profile?.effectiveStatus === "deleted";
  const isPending = profile?.effectiveStatus === "pending_deletion";
  const isActive = profile?.effectiveStatus === "active";
  const hasDeletionHistory = !!profile?.lastDeletedAt;
  const hasNewDataSinceDeletion = profile?.hasNewPersonalData ?? false;

  const loadProfile = useCallback(async (id: string) => {
    const response = await fetch(
      `/api/customer/profile?customerId=${encodeURIComponent(id)}`,
    );
    const body = (await response.json().catch(() => null)) as {
      deletionStatus?: string | null;
      deletedAt?: string | null;
      hasNewPersonalData?: boolean;
      newDataSinceDeletion?: NewDataSummary | null;
      error?: string;
    } | null;

    if (!response.ok) {
      throw new Error(body?.error ?? "Failed to load profile");
    }

    setProfile({
      effectiveStatus: body?.deletionStatus ?? "active",
      lastDeletedAt: body?.deletedAt ?? null,
      hasNewPersonalData: body?.hasNewPersonalData ?? false,
      newDataSinceDeletion: body?.newDataSinceDeletion ?? null,
    });

    if (body?.deletionStatus === "deleted") {
      resetLocalCustomerJourneyAfterDeletion();
      setCustomerId(null);
    }
  }, []);

  useEffect(() => {
    const session = getCustomerSession();
    if (session.customerId && isValidUuid(session.customerId)) {
      setCustomerId(session.customerId);
      void loadProfile(session.customerId).catch(() => {
        /* profile fetch is best-effort on first load */
      });
    }
  }, [loadProfile]);

  const handleDownload = useCallback(async () => {
    if (!customerId) return;

    setExportState("loading");
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(
        `/api/customer/export?customerId=${encodeURIComponent(customerId)}`,
      );

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? "Export failed");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `my-data-${customerId.slice(0, 8)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);

      setExportState("success");
      setMessage(
        isDeleted
          ? "Redacted export downloaded. No personal information is included."
          : hasDeletionHistory
            ? "Your current dataset export has been downloaded."
            : "Your data export has been downloaded.",
      );
    } catch (downloadError) {
      setExportState("error");
      setError(
        downloadError instanceof Error
          ? downloadError.message
          : diagnoseSupabaseError(downloadError),
      );
    }
  }, [customerId, isDeleted, hasDeletionHistory]);

  const handleDeletionRequest = useCallback(async () => {
    if (!customerId || isDeleted) return;

    const confirmed = window.confirm(
      "Request deletion of your personal data? This cannot be undone once approved by our team.",
    );
    if (!confirmed) return;

    setDeletionState("loading");
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/customer/deletion-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId }),
      });

      const body = (await response.json().catch(() => null)) as {
        error?: string;
        alreadyPending?: boolean;
        alreadyDeleted?: boolean;
      } | null;

      if (!response.ok) {
        throw new Error(body?.error ?? "Deletion request failed");
      }

      setDeletionState("success");
      await loadProfile(customerId);

      if (body?.alreadyDeleted) {
        setMessage(
          `Your current dataset has no personal data. Last deletion was ${formatDeletedAt(profile?.lastDeletedAt ?? null)}.`,
        );
        return;
      }

      setMessage(
        body?.alreadyPending
          ? "Your deletion request is already pending review."
          : "Deletion request submitted. We will review it within 7 business days.",
      );
    } catch (requestError) {
      setDeletionState("error");
      setError(
        requestError instanceof Error
          ? requestError.message
          : diagnoseSupabaseError(requestError),
      );
    }
  }, [customerId, isDeleted, loadProfile, profile?.lastDeletedAt]);

  return (
    <CustomerShell
      backHref="/chat"
      backLabel="Back to chat"
      subtitle="Manage My Data"
    >
      {!customerId ? (
        <CustomerCard className="p-4">
          <p className="text-sm text-gray-700">
            Start a chat session first so we can identify your account.
          </p>
          <Link
            href="/chat"
            className="mt-3 inline-flex text-sm font-medium text-[#128c7e] hover:underline"
          >
            Go to Chat →
          </Link>
        </CustomerCard>
      ) : (
        <div className="space-y-4">
          {isDeleted ? (
            <CustomerCard className="space-y-2 p-4">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-[#128c7e]" />
                <div>
                  <CustomerSectionTitle className="mb-1 normal-case tracking-normal text-[#075e54]">
                    ✅ Data Deletion Completed
                  </CustomerSectionTitle>
                  <p className="text-sm leading-relaxed text-gray-600">
                    Your personal data has been removed. To continue using S3K
                    Commerce, please provide consent again and create a new
                    customer profile.
                  </p>
                </div>
              </div>
            </CustomerCard>
          ) : null}

          {isActive && hasDeletionHistory && hasNewDataSinceDeletion ? (
            <CustomerCard className="space-y-2 p-4">
              <div className="flex items-start gap-3">
                <Info className="mt-0.5 size-5 shrink-0 text-[#128c7e]" />
                <div>
                  <CustomerSectionTitle className="mb-1 normal-case tracking-normal text-[#075e54]">
                    New data collected
                  </CustomerSectionTitle>
                  <p className="text-sm leading-relaxed text-gray-600">
                    Your previous deletion was completed on{" "}
                    {formatDeletedAt(profile?.lastDeletedAt ?? null)}. Since
                    then, we have collected{" "}
                    {describeNewData(profile?.newDataSinceDeletion ?? null)}.
                    You can download or request deletion of this new dataset.
                  </p>
                </div>
              </div>
            </CustomerCard>
          ) : null}

          {!isDeleted ? (
            <>
              <CustomerCard className="p-4">
                <CustomerSectionTitle className="mb-3">
                  Your data rights
                </CustomerSectionTitle>
                <p className="text-sm leading-relaxed text-gray-600">
                  Under the Digital Personal Data Protection Act, you can
                  download a copy of your data or request deletion of your
                  personal information.
                </p>
                <Link
                  href="/privacy"
                  className="mt-2 inline-flex text-xs font-medium text-[#128c7e] hover:underline"
                >
                  Read our Privacy Policy
                </Link>
              </CustomerCard>

              <CustomerCard className="space-y-3 p-4">
                <CustomerSectionTitle>Download My Data</CustomerSectionTitle>
                <p className="text-sm text-gray-600">
                  {hasDeletionHistory
                    ? "Export your current dataset collected since your last deletion."
                    : "Export your profile, orders, addresses, and chat history as JSON."}
                </p>
                <CustomerPrimaryButton
                  onClick={() => void handleDownload()}
                  disabled={exportState === "loading"}
                  className="gap-2"
                >
                  <Download className="size-4" />
                  {exportState === "loading"
                    ? "Preparing export…"
                    : "Download My Data"}
                </CustomerPrimaryButton>
              </CustomerCard>

              <CustomerCard className="space-y-3 p-4">
                <CustomerSectionTitle>
                  Request Data Deletion
                </CustomerSectionTitle>
                <p className="text-sm text-gray-600">
                  Submit a request to delete your current personal data. Our
                  team will review and process it within 30 days.
                </p>
                {isPending ? (
                  <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    Status: pending deletion review
                  </p>
                ) : null}
                <button
                  type="button"
                  onClick={() => void handleDeletionRequest()}
                  disabled={deletionState === "loading" || isPending}
                  className="flex h-10 w-full items-center justify-center gap-2 rounded-full border border-red-200 bg-white text-sm font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
                >
                  <Trash2 className="size-4" />
                  {deletionState === "loading"
                    ? "Submitting…"
                    : "Request Data Deletion"}
                </button>
              </CustomerCard>
            </>
          ) : (
            <CustomerCard className="space-y-3 p-4">
              <CustomerSectionTitle>Download Deletion Record</CustomerSectionTitle>
              <p className="text-sm text-gray-600">
                Download a redacted record confirming your current dataset was
                deleted.
              </p>
              <CustomerPrimaryButton
                onClick={() => void handleDownload()}
                disabled={exportState === "loading"}
                className="gap-2"
              >
                <Download className="size-4" />
                {exportState === "loading"
                  ? "Preparing export…"
                  : "Download Deletion Record"}
              </CustomerPrimaryButton>
            </CustomerCard>
          )}

          {message ? (
            <p className="rounded-lg bg-[#ecfdf5] px-3 py-2 text-sm text-[#075e54]">
              {message}
            </p>
          ) : null}
          {error ? (
            <p
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              {error}
            </p>
          ) : null}
        </div>
      )}
    </CustomerShell>
  );
}
