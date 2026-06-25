-- Return management workflow: logistics fields, extended statuses, and indexes

ALTER TABLE return_requests
  ADD COLUMN IF NOT EXISTS customer_name TEXT,
  ADD COLUMN IF NOT EXISTS pickup_address TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS pickup_reference TEXT,
  ADD COLUMN IF NOT EXISTS refund_reference TEXT,
  ADD COLUMN IF NOT EXISTS reject_reason TEXT,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pickup_scheduled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS picked_up_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ;

ALTER TABLE return_requests DROP CONSTRAINT IF EXISTS return_requests_status_check;

-- Migrate legacy status name (must run after dropping old constraint)
UPDATE return_requests SET status = 'pending' WHERE status = 'pending_review';

ALTER TABLE return_requests ADD CONSTRAINT return_requests_status_check CHECK (
  status IN (
    'awaiting_reason',
    'awaiting_photo',
    'pending',
    'approved',
    'rejected',
    'pickup_scheduled',
    'picked_up',
    'refunded'
  )
);

CREATE INDEX IF NOT EXISTS idx_return_requests_status
  ON return_requests (status, created_at DESC);
