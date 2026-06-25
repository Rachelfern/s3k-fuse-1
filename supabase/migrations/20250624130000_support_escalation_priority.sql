-- Support ticket metadata on conversations + SUPPORT issue type

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS support_ticket_id TEXT REFERENCES support_tickets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS support_ticket_created_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_conversations_support_ticket
  ON conversations (support_ticket_id)
  WHERE support_ticket_id IS NOT NULL;

ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_ai_issue_type_check;
ALTER TABLE conversations ADD CONSTRAINT conversations_ai_issue_type_check
  CHECK (ai_issue_type IN (
    'NORMAL', 'QUESTION', 'ORDER_ISSUE', 'PAYMENT_ISSUE',
    'REFUND_REQUEST', 'COMPLAINT', 'URGENT', 'SUPPORT'
  ));
