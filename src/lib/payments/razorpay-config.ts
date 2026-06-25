const PLACEHOLDER_PATTERN = /xxxxx|xxxx|your_|placeholder|changeme/i;
const KEY_ID_PATTERN = /^rzp_(test|live)_[A-Za-z0-9]{6,}$/;

export function isValidRazorpayKeyId(key?: string | null): boolean {
  const trimmed = key?.trim();
  if (!trimmed || PLACEHOLDER_PATTERN.test(trimmed)) {
    return false;
  }
  return KEY_ID_PATTERN.test(trimmed);
}

export function isValidRazorpayKeySecret(secret?: string | null): boolean {
  const trimmed = secret?.trim();
  if (!trimmed || PLACEHOLDER_PATTERN.test(trimmed)) {
    return false;
  }
  return trimmed.length >= 8;
}

export function getRazorpayKeyIdFromEnv(): string | undefined {
  const keyId =
    process.env.RAZORPAY_KEY_ID?.trim() ||
    process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID?.trim();
  return isValidRazorpayKeyId(keyId) ? keyId : undefined;
}

export function getRazorpayKeySecretFromEnv(): string | undefined {
  const secret = process.env.RAZORPAY_KEY_SECRET?.trim();
  return isValidRazorpayKeySecret(secret) ? secret : undefined;
}

export function isRazorpayLiveReady(): boolean {
  return Boolean(getRazorpayKeyIdFromEnv() && getRazorpayKeySecretFromEnv());
}

export function describeRazorpayConfig(): {
  keyIdPresent: boolean;
  keyIdValid: boolean;
  keySecretPresent: boolean;
  keySecretValid: boolean;
  ready: boolean;
} {
  const rawKeyId =
    process.env.RAZORPAY_KEY_ID?.trim() ||
    process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID?.trim();
  const rawSecret = process.env.RAZORPAY_KEY_SECRET?.trim();

  return {
    keyIdPresent: Boolean(rawKeyId),
    keyIdValid: isValidRazorpayKeyId(rawKeyId),
    keySecretPresent: Boolean(rawSecret),
    keySecretValid: isValidRazorpayKeySecret(rawSecret),
    ready: isRazorpayLiveReady(),
  };
}
