-- Migration: initial schema for S3K Commerce
-- Mirrors supabase/schema.sql — run seed separately via supabase/seed.sql

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

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
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (business_id, phone)
);

CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  unread_count INTEGER NOT NULL DEFAULT 0 CHECK (unread_count >= 0),
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
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
    payment_status IN ('pending', 'verified', 'failed')
  ),
  delivery_courier TEXT,
  tracking_id TEXT,
  shipment_status TEXT NOT NULL DEFAULT 'assigned' CHECK (
    shipment_status IN ('assigned', 'picked_up', 'in_transit', 'delivered')
  ),
  delivery_address TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_products_business_id ON products (business_id);
CREATE INDEX idx_products_active ON products (active) WHERE active = TRUE;
CREATE INDEX idx_customers_business_phone ON customers (business_id, phone);
CREATE INDEX idx_conversations_customer_created ON conversations (customer_id, created_at DESC);
CREATE INDEX idx_conversations_business_id ON conversations (business_id);
CREATE INDEX idx_messages_conversation_created ON messages (conversation_id, created_at ASC);
CREATE INDEX idx_carts_customer_id ON carts (customer_id);
CREATE INDEX idx_cart_items_cart_id ON cart_items (cart_id);
CREATE INDEX idx_orders_customer_created ON orders (customer_id, created_at DESC);
CREATE INDEX idx_orders_created_at ON orders (created_at DESC);
CREATE INDEX idx_orders_status ON orders (status);
CREATE INDEX idx_orders_payment_status ON orders (payment_status);
CREATE INDEX idx_orders_business_id ON orders (business_id);

CREATE TRIGGER orders_set_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER carts_set_updated_at
  BEFORE UPDATE ON carts
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE messages REPLICA IDENTITY FULL;
ALTER TABLE orders REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER PUBLICATION supabase_realtime ADD TABLE orders;

ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY businesses_public_read
  ON businesses FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY products_public_read
  ON products FOR SELECT TO anon, authenticated USING (active = TRUE);

CREATE POLICY customers_chat_access
  ON customers FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY conversations_chat_access
  ON conversations FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY messages_chat_access
  ON messages FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY carts_demo_access
  ON carts FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY cart_items_demo_access
  ON cart_items FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY orders_demo_read
  ON orders FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY orders_authenticated_read
  ON orders FOR SELECT TO authenticated USING (true);

CREATE POLICY orders_authenticated_write
  ON orders FOR ALL TO authenticated USING (true) WITH CHECK (true);
