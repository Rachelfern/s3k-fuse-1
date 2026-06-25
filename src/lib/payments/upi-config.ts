export const UPI_MERCHANT_ID = "payments@s3kcommerce";
export const UPI_MERCHANT_NAME = "S3K Commerce";
export const UPI_CURRENCY = "INR";

export function buildUpiPaymentUri(input: {
  amount: number;
  orderReference?: string;
}): string {
  const amountString =
    Number.isInteger(input.amount)
      ? String(input.amount)
      : input.amount.toFixed(2);

  const params = new URLSearchParams({
    pa: UPI_MERCHANT_ID,
    pn: UPI_MERCHANT_NAME,
    am: amountString,
    cu: UPI_CURRENCY,
  });

  if (input.orderReference?.trim()) {
    params.set("tn", `Order-${input.orderReference.trim()}`);
  }

  return `upi://pay?${params.toString()}`;
}
