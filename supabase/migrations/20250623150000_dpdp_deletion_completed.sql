-- DPDP deletion completion: track deleted status and timestamp

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_deletion_status_check;

ALTER TABLE customers
  ADD CONSTRAINT customers_deletion_status_check
  CHECK (
    deletion_status IS NULL
    OR deletion_status IN ('pending_deletion', 'deleted')
  );

CREATE INDEX IF NOT EXISTS idx_customers_deleted_at
  ON customers (deleted_at)
  WHERE deleted_at IS NOT NULL;
