-- Add payment_method to orders and backfill from existing data.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS payment_method TEXT;

UPDATE orders
SET payment_method = 'cod'
WHERE payment_method IS NULL
  AND (
    payment_utr LIKE 'COD-%'
    OR notes ILIKE '%cash on delivery%'
  );

UPDATE orders
SET payment_method = 'card'
WHERE payment_method IS NULL
  AND notes ILIKE '%card payment%';

UPDATE orders
SET payment_method = 'upi'
WHERE payment_method IS NULL;

ALTER TABLE orders
  ALTER COLUMN payment_method SET DEFAULT 'upi';

ALTER TABLE orders
  ALTER COLUMN payment_method SET NOT NULL;

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_method_check;

ALTER TABLE orders
  ADD CONSTRAINT orders_payment_method_check
  CHECK (payment_method IN ('upi', 'card', 'cod'));

CREATE INDEX IF NOT EXISTS idx_orders_payment_method ON orders (payment_method);
