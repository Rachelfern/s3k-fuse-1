-- Order state machine: add awaiting_payment, rename picked_up → packed, fix inconsistent rows.

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_shipment_status_check;

UPDATE orders
SET shipment_status = 'packed'
WHERE shipment_status = 'picked_up';

UPDATE orders
SET shipment_status = 'awaiting_payment'
WHERE payment_status = 'pending'
  AND shipment_status IN ('packed', 'in_transit', 'delivered');

UPDATE orders
SET shipment_status = 'awaiting_payment'
WHERE shipment_status = 'assigned';

ALTER TABLE orders
  ALTER COLUMN shipment_status SET DEFAULT 'awaiting_payment';

ALTER TABLE orders
  ADD CONSTRAINT orders_shipment_status_check
  CHECK (shipment_status IN (
    'awaiting_payment',
    'assigned',
    'packed',
    'in_transit',
    'delivered'
  ));
