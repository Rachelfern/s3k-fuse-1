-- S3K Commerce — complete database schema
-- Derived from application code in src/
-- Run on an empty Supabase project, then run supabase/seed.sql

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT 'S3K Commerce',
  slug TEXT UNIQUE NOT NULL DEFAULT 'vaarta-demo'
);

CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  name_en TEXT NOT NULL,
  name_hi TEXT,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'general',
  price NUMERIC(10,2) NOT NULL CHECK (price >= 0),
  stock INTEGER NOT NULL DEFAULT 99 CHECK (stock >= 0),
  image_url TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  name TEXT,
  address TEXT,
  order_count INTEGER NOT NULL DEFAULT 0 CHECK (order_count >= 0),
  total_spent NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (total_spent >= 0),
  consent_given BOOLEAN NOT NULL DEFAULT FALSE,
  dpdp_consent BOOLEAN NOT NULL DEFAULT FALSE,
  dpdp_consent_at TIMESTAMPTZ,
  deletion_status TEXT CHECK (
    deletion_status IS NULL OR deletion_status IN ('pending_deletion', 'deleted')
  ),
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (business_id, phone)
);

CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  unread_count INTEGER NOT NULL DEFAULT 0 CHECK (unread_count >= 0),
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ai_issue_type TEXT NOT NULL DEFAULT 'NORMAL' CHECK (
    ai_issue_type IN (
      'NORMAL', 'QUESTION', 'ORDER_ISSUE', 'PAYMENT_ISSUE',
      'REFUND_REQUEST', 'COMPLAINT', 'URGENT', 'SUPPORT'
    )
  ),
  ai_priority_score INTEGER NOT NULL DEFAULT 10,
  ai_priority_level TEXT NOT NULL DEFAULT 'normal' CHECK (
    ai_priority_level IN ('critical', 'high', 'normal')
  ),
  ai_summary TEXT,
  ai_customer_intent TEXT,
  ai_suggested_action TEXT,
  ai_suggested_reply TEXT,
  ai_insights_at TIMESTAMPTZ,
  needs_human_assistance BOOLEAN NOT NULL DEFAULT FALSE,
  support_ticket_id TEXT,
  support_ticket_created_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('customer', 'admin', 'system')),
  content TEXT NOT NULL,
  intent TEXT,
  was_ai_drafted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE carts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'converted', 'abandoned')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE cart_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id UUID REFERENCES carts(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  price_snapshot NUMERIC(10,2) NOT NULL CHECK (price_snapshot >= 0)
);

CREATE TABLE orders (
  id TEXT PRIMARY KEY DEFAULT ('o_' || substring(gen_random_uuid()::text, 1, 8)),
  business_id UUID REFERENCES businesses(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  cart_id UUID REFERENCES carts(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (
    status IN ('new', 'payment_pending', 'confirmed', 'packed', 'shipped', 'delivered', 'cancelled')
  ),
  total_amount NUMERIC(10,2) NOT NULL CHECK (total_amount >= 0),
  delivery_fee NUMERIC(10,2) NOT NULL DEFAULT 40 CHECK (delivery_fee >= 0),
  payment_utr TEXT,
  payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (
    payment_status IN (
      'pending',
      'verified',
      'failed',
      'verification_pending',
      'rejected',
      'retry_submitted'
    )
  ),
  payment_method TEXT NOT NULL DEFAULT 'upi' CHECK (
    payment_method IN ('upi', 'card', 'cod')
  ),
  delivery_courier TEXT,
  tracking_id TEXT,
  shipment_status TEXT NOT NULL DEFAULT 'awaiting_payment' CHECK (
    shipment_status IN ('awaiting_payment', 'assigned', 'packed', 'in_transit', 'delivered')
  ),
  delivery_address TEXT,
  notes TEXT,
  payment_screenshot_url TEXT,
  payment_screenshot_path TEXT,
  payment_screenshot_uploaded_at TIMESTAMPTZ,
  payment_rejection_reason TEXT,
  payment_rejected_at TIMESTAMPTZ,
  payment_verified_at TIMESTAMPTZ,
  payment_retry_submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Indexes (match query patterns in src/)
-- ---------------------------------------------------------------------------

CREATE INDEX idx_products_business_id ON products (business_id);
CREATE INDEX idx_products_active ON products (active) WHERE active = TRUE;

CREATE INDEX idx_customers_business_phone ON customers (business_id, phone);
CREATE INDEX idx_customers_deletion_status
  ON customers (deletion_status)
  WHERE deletion_status IS NOT NULL;
CREATE INDEX idx_customers_deleted_at
  ON customers (deleted_at)
  WHERE deleted_at IS NOT NULL;

CREATE INDEX idx_conversations_customer_created ON conversations (customer_id, created_at DESC);
CREATE INDEX idx_conversations_business_id ON conversations (business_id);
CREATE INDEX idx_conversations_ai_priority
  ON conversations (ai_priority_score DESC, last_message_at DESC);

CREATE INDEX idx_messages_conversation_created ON messages (conversation_id, created_at ASC);

CREATE INDEX idx_carts_customer_id ON carts (customer_id);
CREATE INDEX idx_cart_items_cart_id ON cart_items (cart_id);

CREATE INDEX idx_orders_customer_created ON orders (customer_id, created_at DESC);
CREATE INDEX idx_orders_created_at ON orders (created_at DESC);
CREATE INDEX idx_orders_status ON orders (status);
CREATE INDEX idx_orders_payment_status ON orders (payment_status);
CREATE INDEX idx_orders_payment_method ON orders (payment_method);
CREATE INDEX idx_orders_business_id ON orders (business_id);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

CREATE TRIGGER orders_set_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER carts_set_updated_at
  BEFORE UPDATE ON carts
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Realtime (postgres_changes subscriptions in chat + admin dashboard)
-- ---------------------------------------------------------------------------

ALTER TABLE messages REPLICA IDENTITY FULL;
ALTER TABLE orders REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER PUBLICATION supabase_realtime ADD TABLE orders;

-- carts / cart_items are schema-ready but have no active subscriptions yet

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Public read for store catalog (future product pages)
CREATE POLICY businesses_public_read
  ON businesses FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY products_public_read
  ON products FOR SELECT
  TO anon, authenticated
  USING (active = TRUE);

-- Customer chat flow uses the anon key directly (src/app/(customer)/chat/page.tsx)
CREATE POLICY customers_chat_access
  ON customers FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY conversations_chat_access
  ON conversations FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY messages_chat_access
  ON messages FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Cart tables: schema-ready for future checkout persistence
CREATE POLICY carts_demo_access
  ON carts FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY cart_items_demo_access
  ON cart_items FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Customer order tracking page subscribes via anon key (demo — same as chat tables)
CREATE POLICY orders_demo_read
  ON orders FOR SELECT
  TO anon, authenticated
  USING (true);

-- Admin writes use authenticated session; service role bypasses RLS
CREATE POLICY orders_authenticated_read
  ON orders FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY orders_authenticated_write
  ON orders FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- DPDP audit log
-- ---------------------------------------------------------------------------

CREATE TABLE dpdp_audit_log (
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

CREATE INDEX idx_dpdp_audit_log_customer_created
  ON dpdp_audit_log (customer_id, created_at DESC);

ALTER TABLE dpdp_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY dpdp_audit_log_service_access
  ON dpdp_audit_log FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- Inventory audit log + atomic stock deduction
-- ---------------------------------------------------------------------------

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

-- service_role bypasses RLS for admin dashboard metrics and AI track-order lookups
