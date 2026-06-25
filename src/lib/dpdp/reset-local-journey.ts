import { clearChatStateCache } from "@/lib/chat/chat-state-cache";
import { clearCustomerSession } from "@/lib/chat/customer-storage";
import { clearDpdpConsent } from "@/lib/dpdp/consent-storage";

export const DELETION_COMPLETED_NOTICE_KEY = "dpdp_deletion_completed_notice";

/** Clears all customer-facing browser state (session, consent, chat cache). */
export function resetLocalCustomerJourney() {
  clearCustomerSession();
  clearChatStateCache();
  clearDpdpConsent();
}

export function markDeletionCompletedNotice() {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(DELETION_COMPLETED_NOTICE_KEY, "true");
}

export function hasDeletionCompletedNotice(): boolean {
  if (typeof window === "undefined") return false;
  return sessionStorage.getItem(DELETION_COMPLETED_NOTICE_KEY) === "true";
}

export function clearDeletionCompletedNotice() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(DELETION_COMPLETED_NOTICE_KEY);
}

/** Full reset after server confirms deletion — also flags the completion notice for onboarding. */
export function resetLocalCustomerJourneyAfterDeletion() {
  resetLocalCustomerJourney();
  markDeletionCompletedNotice();
}
