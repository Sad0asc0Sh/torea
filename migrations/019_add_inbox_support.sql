-- Migration 019: Add Inbox System Support
-- تاریخ: 2025-12-28
-- توضیح: اضافه کردن فیلدها و constraints لازم برای سیستم Inbox

BEGIN;

-- =========================================
-- 1. اضافه کردن updated_at به جداول
-- =========================================

-- 1.1 جدول users
ALTER TABLE users 
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

COMMENT ON COLUMN users.updated_at IS 'آخرین زمان بروزرسانی رکورد';

-- 1.2 جدول credit_sale_requests
ALTER TABLE credit_sale_requests 
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

COMMENT ON COLUMN credit_sale_requests.updated_at IS 'آخرین زمان بروزرسانی رکورد';

-- 1.3 جدول credit_settlement_requests
ALTER TABLE credit_settlement_requests 
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

COMMENT ON COLUMN credit_settlement_requests.updated_at IS 'آخرین زمان بروزرسانی رکورد';

-- =========================================
-- 2. بروزرسانی Constraints
-- =========================================

-- 2.1 اضافه کردن 'forwarded' به automation_item_recipients.status
ALTER TABLE automation_item_recipients 
  DROP CONSTRAINT IF EXISTS automation_item_recipients_status_check;

ALTER TABLE automation_item_recipients 
  ADD CONSTRAINT automation_item_recipients_status_check 
  CHECK (status IN ('pending', 'read', 'approved', 'rejected', 'acknowledged', 'forwarded'));

COMMENT ON COLUMN automation_item_recipients.status IS 'وضعیت: pending, read, approved, rejected, acknowledged, forwarded';

-- 2.2 اضافه کردن 'pending_changes' به users.status
-- ابتدا چک می‌کنیم constraint موجود چیست
DO $$
BEGIN
  -- حذف constraint قدیمی اگر وجود دارد
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'users_status_check' 
    AND table_name = 'users'
  ) THEN
    ALTER TABLE users DROP CONSTRAINT users_status_check;
  END IF;
  
  -- اضافه کردن constraint جدید
  ALTER TABLE users 
    ADD CONSTRAINT users_status_check 
    CHECK (status IN (
      'pending_verification', 
      'pending_telegram', 
      'pending_manager', 
      'active', 
      'rejected', 
      'pending_changes'
    ));
END $$;

COMMENT ON COLUMN users.status IS 'وضعیت: pending_verification, pending_telegram, pending_manager, active, rejected, pending_changes';

-- =========================================
-- 3. ایندکس‌های بهینه‌ساز برای Inbox
-- =========================================

-- 3.1 برای User Approvals
CREATE INDEX IF NOT EXISTS idx_users_status_manager 
  ON users(status, manager_id) 
  WHERE status = 'pending_manager';

COMMENT ON INDEX idx_users_status_manager IS 'بهینه‌سازی کوئری User Approvals Inbox';

-- 3.2 برای Credit Sale Approvals
CREATE INDEX IF NOT EXISTS idx_csr_final_status_approvers 
  ON credit_sale_requests(final_status, approver1_node_id, approver2_node_id, approver1_status, approver2_status) 
  WHERE final_status = 'pending_approvals';

COMMENT ON INDEX idx_csr_final_status_approvers IS 'بهینه‌سازی کوئری Credit Approvals Inbox';

-- 3.3 برای Credit Settlement Approvals
CREATE INDEX IF NOT EXISTS idx_settlement_status_finance 
  ON credit_settlement_requests(status, credit_request_id) 
  WHERE status = 'pending';

COMMENT ON INDEX idx_settlement_status_finance IS 'بهینه‌سازی کوئری Settlement Approvals Inbox';

-- 3.4 برای Automation Inbox
CREATE INDEX IF NOT EXISTS idx_air_user_status_pending 
  ON automation_item_recipients(user_id, status, item_id) 
  WHERE status = 'pending';

COMMENT ON INDEX idx_air_user_status_pending IS 'بهینه‌سازی کوئری Automation Inbox';

DO $$
BEGIN
  IF to_regclass('public.negotiation_analysis_reports') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_nar_user_recent
      ON public.negotiation_analysis_reports(user_id, created_at DESC)
      WHERE weak_points IS NOT NULL
         OR exercises IS NOT NULL
         OR missed_strategic_products IS NOT NULL;

    COMMENT ON INDEX idx_nar_user_recent IS 'بهینه‌سازی کوئری Training Inbox';
  ELSE
    RAISE NOTICE 'Skipping idx_nar_user_recent because public.negotiation_analysis_reports does not exist';
  END IF;
END $$;

-- =========================================
-- 4. Triggers برای بروزرسانی updated_at
-- =========================================

-- 4.1 Function برای بروزرسانی خودکار updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4.2 Trigger برای users
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 4.3 Trigger برای credit_sale_requests
DROP TRIGGER IF EXISTS update_csr_updated_at ON credit_sale_requests;
CREATE TRIGGER update_csr_updated_at
  BEFORE UPDATE ON credit_sale_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 4.4 Trigger برای credit_settlement_requests
DROP TRIGGER IF EXISTS update_csr_settlement_updated_at ON credit_settlement_requests;
CREATE TRIGGER update_csr_settlement_updated_at
  BEFORE UPDATE ON credit_settlement_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =========================================
-- 5. Verification
-- =========================================

-- بررسی اینکه همه تغییرات اعمال شده‌اند
DO $$
DECLARE
  missing_columns TEXT[] := '{}';
  missing_indexes TEXT[] := '{}';
BEGIN
  -- بررسی ستون‌ها
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'updated_at') THEN
    missing_columns := array_append(missing_columns, 'users.updated_at');
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'credit_sale_requests' AND column_name = 'updated_at') THEN
    missing_columns := array_append(missing_columns, 'credit_sale_requests.updated_at');
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'credit_settlement_requests' AND column_name = 'updated_at') THEN
    missing_columns := array_append(missing_columns, 'credit_settlement_requests.updated_at');
  END IF;
  
  -- بررسی ایندکس‌ها
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_users_status_manager') THEN
    missing_indexes := array_append(missing_indexes, 'idx_users_status_manager');
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_csr_final_status_approvers') THEN
    missing_indexes := array_append(missing_indexes, 'idx_csr_final_status_approvers');
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_settlement_status_finance') THEN
    missing_indexes := array_append(missing_indexes, 'idx_settlement_status_finance');
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_air_user_status_pending') THEN
    missing_indexes := array_append(missing_indexes, 'idx_air_user_status_pending');
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_nar_user_recent') THEN
    missing_indexes := array_append(missing_indexes, 'idx_nar_user_recent');
  END IF;
  
  -- گزارش نتایج
  IF array_length(missing_columns, 1) > 0 THEN
    RAISE WARNING 'Missing columns: %', array_to_string(missing_columns, ', ');
  END IF;
  
  IF array_length(missing_indexes, 1) > 0 THEN
    RAISE WARNING 'Missing indexes: %', array_to_string(missing_indexes, ', ');
  END IF;
  
  IF array_length(missing_columns, 1) IS NULL AND array_length(missing_indexes, 1) IS NULL THEN
    RAISE NOTICE '✅ Migration 019 completed successfully!';
  END IF;
END $$;

COMMIT;
