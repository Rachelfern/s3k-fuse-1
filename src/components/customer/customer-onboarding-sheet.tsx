"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { STORE_NAME } from "@/lib/brand";
import {
  clearDeletionCompletedNotice,
  hasDeletionCompletedNotice,
} from "@/lib/dpdp/reset-local-journey";
import { hasDpdpConsent, saveDpdpConsent } from "@/lib/dpdp/consent-storage";
import { cn } from "@/lib/utils";

type OnboardingStep = "consent" | "welcome";

interface CustomerOnboardingSheetProps {
  open: boolean;
  onConnect: (name: string) => Promise<void>;
  loading: boolean;
  error: string | null;
}

export function CustomerOnboardingSheet({
  open,
  onConnect,
  loading,
  error,
}: CustomerOnboardingSheetProps) {
  const [step, setStep] = useState<OnboardingStep>(
    hasDpdpConsent() ? "welcome" : "consent",
  );
  const [name, setName] = useState("");
  const [showDeletionNotice, setShowDeletionNotice] = useState(
    hasDeletionCompletedNotice(),
  );

  useEffect(() => {
    if (open) {
      setStep(hasDpdpConsent() ? "welcome" : "consent");
      setShowDeletionNotice(hasDeletionCompletedNotice());
    }
  }, [open]);

  if (!open) return null;

  function handleAcceptConsent() {
    saveDpdpConsent();
    clearDeletionCompletedNotice();
    setShowDeletionNotice(false);
    setStep("welcome");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    await onConnect(trimmed);
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" aria-hidden />
      <div
        role="dialog"
        aria-labelledby="onboarding-title"
        className="fixed inset-x-0 bottom-0 z-50 max-h-[90dvh] overflow-y-auto rounded-t-2xl bg-white px-4 pb-8 pt-5 shadow-2xl safe-bottom sm:px-6"
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-gray-300" />

        {step === "consent" ? (
          <div className="space-y-4">
            {showDeletionNotice ? (
              <div className="rounded-lg border border-[#128c7e]/30 bg-[#ecfdf5] px-3 py-3">
                <p className="text-sm font-semibold text-[#075e54]">
                  ✅ Data Deletion Completed
                </p>
                <p className="mt-1 text-sm leading-relaxed text-gray-600">
                  Your personal data has been removed. To continue using{" "}
                  {STORE_NAME}, please provide consent again and create a new
                  customer profile.
                </p>
              </div>
            ) : null}

            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#ecfdf5] text-[#128c7e]">
                <ShieldCheck className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h2
                  id="onboarding-title"
                  className="text-base font-semibold text-gray-900"
                >
                  Privacy &amp; Data Consent
                </h2>
                <p className="mt-1.5 text-sm leading-relaxed text-gray-600">
                  We use your information to process orders, provide customer
                  support, and improve your shopping experience. By continuing,
                  you consent to the storage and processing of your data.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={handleAcceptConsent}
                className="flex-1 rounded-lg bg-[var(--whatsapp-primary)] py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--whatsapp-primary-hover)]"
              >
                Accept DPDP Consent
              </button>
              <Link
                href="/privacy"
                className={cn(
                  "flex flex-1 items-center justify-center rounded-lg border border-gray-200 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50",
                )}
              >
                View Privacy Policy
              </Link>
            </div>
          </div>
        ) : (
          <>
            <h2
              id="onboarding-title"
              className="text-lg font-semibold text-gray-900"
            >
              Welcome to {STORE_NAME}
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Please enter your details to continue.
            </p>

            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              <div>
                <label
                  htmlFor="name"
                  className="mb-1 block text-xs font-medium text-gray-600"
                >
                  Your Name
                </label>
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Rachel Fernandes"
                  required
                  autoFocus
                  className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:border-[var(--whatsapp-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--whatsapp-primary)]"
                />
              </div>
              {error ? (
                <div
                  role="alert"
                  className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
                >
                  {error}
                </div>
              ) : null}
              <button
                type="submit"
                disabled={loading || !name.trim()}
                className="w-full rounded-lg bg-[var(--whatsapp-primary)] py-3 text-sm font-semibold text-white transition-colors hover:bg-[var(--whatsapp-primary-hover)] disabled:opacity-60"
              >
                {loading ? "Starting…" : "Start Chatting →"}
              </button>
            </form>
          </>
        )}
      </div>
    </>
  );
}
