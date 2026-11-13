-- Automation Module Improvements
-- اضافه کردن ستونهای جدید و ایندکسها برای ماژول اتوماسیون

BEGIN;

-- 1. اضافه کردن parent_item_id برای زنجیرهای کردن آیتمها
ALTER TABLE automation_items 
  ADD COLUMN IF NOT EXISTS parent_item_id INT REFERENCES automation_items(id) ON DELETE SET NULL;

-- 2. بهبود جدول recipients - اضافه کردن status برای هر گیرنده
ALTER TABLE automation_item_recipients 
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'pending' 
  CHECK (status IN ('pending', 'read', 'approved', 'rejected', 'acknowledged'));

ALTER TABLE automation_item_recipients 
  ADD COLUMN IF NOT EXISTS action_at TIMESTAMP NULL;

-- 3. ایجاد جدول logs برای پیگیری کامل
CREATE TABLE IF NOT EXISTS public.automation_item_logs (
  id SERIAL PRIMARY KEY,
  item_id INT NOT NULL REFERENCES automation_items(id) ON DELETE CASCADE,
  action_type VARCHAR(30) NOT NULL CHECK (action_type IN (
    'created', 'sent', 'received', 'read',
    'approved', 'rejected', 'acknowledged',
    'forwarded_as_request', 'forwarded_as_referral', 'forwarded_as_announcement',
    'reminded_48h'
  )),
  action_by_user_id UUID REFERENCES users(id),
  action_at TIMESTAMP DEFAULT NOW(),
  note TEXT,
  voice_path TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 4. ایندکسهای بهینهساز
CREATE INDEX IF NOT EXISTS idx_automation_items_parent ON automation_items(parent_item_id);
CREATE INDEX IF NOT EXISTS idx_automation_items_created_by ON automation_items(created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_automation_items_topic ON automation_items(topic_id);

CREATE INDEX IF NOT EXISTS idx_air_user_status ON automation_item_recipients(user_id, status);

CREATE INDEX IF NOT EXISTS idx_automation_logs_item ON automation_item_logs(item_id, action_at DESC);
CREATE INDEX IF NOT EXISTS idx_automation_logs_user ON automation_item_logs(action_by_user_id);
CREATE INDEX IF NOT EXISTS idx_automation_logs_type ON automation_item_logs(action_type);

-- 5. View برای زنجیره thread
CREATE OR REPLACE VIEW automation_item_threads AS
WITH RECURSIVE thread AS (
  SELECT 
    id, parent_item_id, item_type, topic_id, 
    created_by_user_id, created_at, status,
    0 AS depth,
    ARRAY[id] AS path
  FROM automation_items 
  WHERE parent_item_id IS NULL
  
  UNION ALL
  
  SELECT 
    ai.id, ai.parent_item_id, ai.item_type, ai.topic_id,
    ai.created_by_user_id, ai.created_at, ai.status,
    t.depth + 1,
    t.path || ai.id
  FROM automation_items ai
  JOIN thread t ON ai.parent_item_id = t.id
  WHERE t.depth < 10
)
SELECT * FROM thread ORDER BY path;

COMMIT;
