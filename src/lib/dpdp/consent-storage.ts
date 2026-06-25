export const DPDP_KEYS = {
  consent: "dpdp_consent",
  consentTimestamp: "dpdp_consent_timestamp",
} as const;

export function hasDpdpConsent(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(DPDP_KEYS.consent) === "true";
}

export function getDpdpConsentTimestamp(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(DPDP_KEYS.consentTimestamp);
}

export function saveDpdpConsent(timestamp = new Date().toISOString()) {
  localStorage.setItem(DPDP_KEYS.consent, "true");
  localStorage.setItem(DPDP_KEYS.consentTimestamp, timestamp);
}

export function clearDpdpConsent() {
  localStorage.removeItem(DPDP_KEYS.consent);
  localStorage.removeItem(DPDP_KEYS.consentTimestamp);
}

export function syncDpdpConsentFromServer(
  consented: boolean,
  consentAt: string | null,
) {
  if (consented) {
    saveDpdpConsent(consentAt ?? new Date().toISOString());
  } else {
    clearDpdpConsent();
  }
}
