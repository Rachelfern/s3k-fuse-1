-- Payment verification rejection workflow: rejected / retry_submitted + audit fields

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_status_check;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS payment_rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS payment_rejected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payment_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payment_retry_submitted_at TIMESTAMPTZ;

ALTER TABLE orders
  ADD CONSTRAINT orders_payment_status_check CHECK (
    payment_status IN (
      'pending',
      'verified',
      'failed',
      'verification_pending',
      'rejected',
      'retry_submitted'
    )
  );

-- Reload PostgREST schema cache so Supabase API sees new columns immediately
NOTIFY pgrst, 'reload schema';
