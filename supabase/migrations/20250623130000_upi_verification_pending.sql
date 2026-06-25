-- Allow verification_pending payment status for manual UPI QR verification
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_status_check;

ALTER TABLE orders
  ADD CONSTRAINT orders_payment_status_check
  CHECK (
    payment_status IN ('pending', 'verified', 'failed', 'verification_pending')
  );
