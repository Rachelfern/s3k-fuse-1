-- Return requests, support tickets, and human-assistance flag on conversations

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS needs_human_assistance BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_conversations_needs_human
  ON conversations (needs_human_assistance, last_message_at DESC)
  WHERE needs_human_assistance = TRUE;

CREATE TABLE IF NOT EXISTS return_requests (
  id TEXT PRIMARY KEY DEFAULT ('ret_' || substring(gen_random_uuid()::text, 1, 8)),
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  request_type TEXT NOT NULL CHECK (request_type IN ('entire', 'partial')),
  status TEXT NOT NULL DEFAULT 'awaiting_reason' CHECK (
    status IN ('awaiting_reason', 'awaiting_photo', 'pending_review', 'approved', 'rejected')
  ),
  reason TEXT,
  photo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS return_request_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_request_id TEXT NOT NULL REFERENCES return_requests(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0)
);

CREATE TABLE IF NOT EXISTS support_tickets (
  id TEXT PRIMARY KEY DEFAULT ('sup_' || substring(gen_random_uuid()::text, 1, 8)),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  order_id TEXT REFERENCES orders(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (
    status IN ('open', 'assigned', 'resolved', 'closed')
  ),
  subject TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_return_requests_customer
  ON return_requests (customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_return_requests_order
  ON return_requests (order_id);

CREATE INDEX IF NOT EXISTS idx_support_tickets_conversation
  ON support_tickets (conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_support_tickets_status
  ON support_tickets (status, created_at DESC);

ALTER TABLE return_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE return_request_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY return_requests_service ON return_requests FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY return_request_items_service ON return_request_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY support_tickets_service ON support_tickets FOR ALL USING (true) WITH CHECK (true);
