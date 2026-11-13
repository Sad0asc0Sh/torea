-- Adds missing optional credit columns if not present
ALTER TABLE IF EXISTS credit_sale_requests
  ADD COLUMN IF NOT EXISTS invoice_number VARCHAR(64),
  ADD COLUMN IF NOT EXISTS customer_name TEXT,
  ADD COLUMN IF NOT EXISTS requester_note TEXT;

ALTER TABLE IF EXISTS credit_settlement_requests
  ADD COLUMN IF NOT EXISTS requester_note TEXT,
  ADD COLUMN IF NOT EXISTS decision_note TEXT,
  ADD COLUMN IF NOT EXISTS decision_voice_path TEXT,
  ADD COLUMN IF NOT EXISTS decided_at TIMESTAMP;
