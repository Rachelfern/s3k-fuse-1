-- DPDP consent management: customer fields, deletion status, audit log

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS dpdp_consent BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS dpdp_consent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deletion_status TEXT CHECK (
    deletion_status IS NULL OR deletion_status IN ('pending_deletion')
  );

-- Backfill from legacy consent_given column
UPDATE customers
SET
  dpdp_consent = consent_given,
  dpdp_consent_at = CASE WHEN consent_given THEN created_at ELSE NULL END
WHERE dpdp_consent = FALSE AND consent_given = TRUE;

CREATE INDEX IF NOT EXISTS idx_customers_deletion_status
  ON customers (deletion_status)
  WHERE deletion_status IS NOT NULL;

CREATE TABLE IF NOT EXISTS dpdp_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (
    event_type IN (
      'consent_given',
      'consent_withdrawn',
      'deletion_requested',
      'deletion_completed'
    )
  ),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dpdp_audit_log_customer_created
  ON dpdp_audit_log (customer_id, created_at DESC);

ALTER TABLE dpdp_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY dpdp_audit_log_service_access
  ON dpdp_audit_log FOR ALL TO service_role USING (true) WITH CHECK (true);
