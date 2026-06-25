-- Inventory audit log and atomic stock deduction on confirmed orders

CREATE TABLE inventory_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL,
  previous_stock INTEGER NOT NULL CHECK (previous_stock >= 0),
  quantity_sold INTEGER NOT NULL CHECK (quantity_sold > 0),
  new_stock INTEGER NOT NULL CHECK (new_stock >= 0),
  order_id TEXT REFERENCES orders(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_inventory_audit_log_order_id ON inventory_audit_log (order_id);
CREATE INDEX idx_inventory_audit_log_product_id ON inventory_audit_log (product_id);
CREATE INDEX idx_inventory_audit_log_created_at ON inventory_audit_log (created_at DESC);

CREATE OR REPLACE FUNCTION public.deduct_inventory_for_order(
  p_order_id TEXT,
  p_items JSONB
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  item RECORD;
  current_stock INTEGER;
  product_name TEXT;
BEGIN
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'No items to deduct';
  END IF;

  FOR item IN
    SELECT
      (elem->>'product_id')::UUID AS product_id,
      (elem->>'quantity')::INTEGER AS quantity
    FROM jsonb_array_elements(p_items) AS elem
  LOOP
    IF item.quantity IS NULL OR item.quantity <= 0 THEN
      RAISE EXCEPTION 'Invalid quantity for product %', item.product_id;
    END IF;

    SELECT stock, name_en INTO current_stock, product_name
    FROM products
    WHERE id = item.product_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product not found: %', item.product_id;
    END IF;

    IF current_stock < item.quantity THEN
      RAISE EXCEPTION 'Insufficient stock for %: requested %, available %',
        product_name, item.quantity, current_stock;
    END IF;

    UPDATE products
    SET stock = stock - item.quantity
    WHERE id = item.product_id;

    INSERT INTO inventory_audit_log (
      product_id,
      product_name,
      previous_stock,
      quantity_sold,
      new_stock,
      order_id
    ) VALUES (
      item.product_id,
      product_name,
      current_stock,
      item.quantity,
      current_stock - item.quantity,
      p_order_id
    );
  END LOOP;
END;
$$;

ALTER TABLE inventory_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY inventory_audit_log_service_access
  ON inventory_audit_log FOR ALL TO service_role USING (true) WITH CHECK (true);
