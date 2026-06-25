-- Payment screenshot storage + AI operations fields on conversations

-- ---------------------------------------------------------------------------
-- Orders: payment proof screenshot
-- ---------------------------------------------------------------------------

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS payment_screenshot_url TEXT,
  ADD COLUMN IF NOT EXISTS payment_screenshot_path TEXT,
  ADD COLUMN IF NOT EXISTS payment_screenshot_uploaded_at TIMESTAMPTZ;

-- ---------------------------------------------------------------------------
-- Conversations: AI issue flagging + next best action cache
-- ---------------------------------------------------------------------------

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS ai_issue_type TEXT NOT NULL DEFAULT 'NORMAL',
  ADD COLUMN IF NOT EXISTS ai_priority_score INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS ai_priority_level TEXT NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS ai_summary TEXT,
  ADD COLUMN IF NOT EXISTS ai_customer_intent TEXT,
  ADD COLUMN IF NOT EXISTS ai_suggested_action TEXT,
  ADD COLUMN IF NOT EXISTS ai_suggested_reply TEXT,
  ADD COLUMN IF NOT EXISTS ai_insights_at TIMESTAMPTZ;

ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_ai_issue_type_check;
ALTER TABLE conversations ADD CONSTRAINT conversations_ai_issue_type_check
  CHECK (ai_issue_type IN (
    'NORMAL', 'QUESTION', 'ORDER_ISSUE', 'PAYMENT_ISSUE',
    'REFUND_REQUEST', 'COMPLAINT', 'URGENT'
  ));

ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_ai_priority_level_check;
ALTER TABLE conversations ADD CONSTRAINT conversations_ai_priority_level_check
  CHECK (ai_priority_level IN ('critical', 'high', 'normal'));

CREATE INDEX IF NOT EXISTS idx_conversations_ai_priority
  ON conversations (ai_priority_score DESC, last_message_at DESC);

-- ---------------------------------------------------------------------------
-- Supabase Storage: payment screenshots (private bucket)
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'payment-screenshots',
  'payment-screenshots',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;
