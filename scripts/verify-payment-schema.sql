-- Payment workflow schema verification (run in Supabase SQL Editor)
-- All checks should return rows; empty result = missing column or constraint.

-- 1) Required columns on orders
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'orders'
  AND column_name IN (
    'payment_status',
    'payment_method',
    'payment_utr',
    'payment_screenshot_url',
    'payment_screenshot_path',
    'payment_screenshot_uploaded_at',
    'payment_rejection_reason',
    'payment_rejected_at',
    'payment_verified_at',
    'payment_retry_submitted_at'
  )
ORDER BY column_name;

-- Expected: 10 rows. If fewer, note which column_name values are missing.

-- 2) payment_status CHECK constraint values
SELECT
  con.conname AS constraint_name,
  pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
WHERE nsp.nspname = 'public'
  AND rel.relname = 'orders'
  AND con.conname = 'orders_payment_status_check';

-- Expected definition includes:
-- pending, verified, failed, verification_pending, rejected, retry_submitted

-- 3) Quick pass/fail summary
SELECT
  COUNT(*) FILTER (WHERE column_name = 'payment_rejection_reason') AS has_rejection_reason,
  COUNT(*) FILTER (WHERE column_name = 'payment_rejected_at') AS has_rejected_at,
  COUNT(*) FILTER (WHERE column_name = 'payment_verified_at') AS has_verified_at,
  COUNT(*) FILTER (WHERE column_name = 'payment_retry_submitted_at') AS has_retry_submitted_at,
  COUNT(*) FILTER (WHERE column_name = 'payment_screenshot_path') AS has_screenshot_path
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'orders';

-- Expected: all counts = 1

-- 4) Sample read (confirms PostgREST/API layer can select audit fields)
SELECT
  id,
  payment_status,
  payment_rejection_reason,
  payment_rejected_at,
  payment_verified_at,
  payment_retry_submitted_at,
  payment_screenshot_uploaded_at
FROM orders
ORDER BY created_at DESC
LIMIT 5;
