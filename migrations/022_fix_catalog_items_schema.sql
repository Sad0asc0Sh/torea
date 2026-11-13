-- Migration 022: Fix catalog_items schema inconsistencies
-- تاریخ: 2026-01-02
-- هدف: رفع ناسازگاری schema با کد backend

BEGIN;

-- 1. پر کردن type های NULL
UPDATE catalog_items 
SET type = 'page' 
WHERE type IS NULL;

-- 2. اضافه کردن NOT NULL به type
ALTER TABLE catalog_items 
  ALTER COLUMN type SET NOT NULL;

-- 3. اضافه کردن CHECK constraint
ALTER TABLE catalog_items
  DROP CONSTRAINT IF EXISTS catalog_items_type_check;

ALTER TABLE catalog_items
  ADD CONSTRAINT catalog_items_type_check 
  CHECK (type IN ('group', 'page', 'tool', 'report', 'form', 'setting', 'action'));

-- 4. اضافه کردن FK برای parent_key
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'catalog_items_parent_fk'
      AND conrelid = 'public.catalog_items'::regclass
  ) THEN
    ALTER TABLE catalog_items
      ADD CONSTRAINT catalog_items_parent_fk
      FOREIGN KEY (parent_key) 
      REFERENCES catalog_items(key) 
      ON DELETE SET NULL;
  END IF;
END$$;

-- 5. اضافه کردن Trigger برای updated_at
DO $$
BEGIN
  -- بررسی وجود تابع
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc 
    WHERE proname = 'set_updated_at' 
      AND pronamespace = 'public'::regnamespace
  ) THEN
    -- ساخت تابع
    CREATE FUNCTION public.set_updated_at()
    RETURNS TRIGGER AS $func$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $func$ LANGUAGE plpgsql;
  END IF;
  
  -- بررسی وجود trigger
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'trg_catalog_items_updated_at'
      AND tgrelid = 'public.catalog_items'::regclass
  ) THEN
    CREATE TRIGGER trg_catalog_items_updated_at
    BEFORE UPDATE ON public.catalog_items
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();
  END IF;
END$$;

COMMENT ON COLUMN catalog_items.type IS 
  'نوع آیتم: group, page, tool, report, form, setting, action';

COMMENT ON CONSTRAINT catalog_items_type_check ON catalog_items IS
  'فقط مقادیر مجاز برای type';

COMMENT ON CONSTRAINT catalog_items_parent_fk ON catalog_items IS
  'ارجاع به والد در ساختار درختی';

-- Verification
DO $$
DECLARE
  type_nullable BOOLEAN;
  constraint_count INTEGER;
BEGIN
  -- بررسی NOT NULL
  SELECT (is_nullable = 'NO') INTO type_nullable
  FROM information_schema.columns
  WHERE table_name = 'catalog_items' AND column_name = 'type';
  
  IF NOT type_nullable THEN
    RAISE EXCEPTION 'Migration failed: type column is still nullable';
  END IF;
  
  -- بررسی constraints
  SELECT COUNT(*) INTO constraint_count
  FROM pg_constraint
  WHERE conrelid = 'public.catalog_items'::regclass
    AND conname IN ('catalog_items_type_check', 'catalog_items_parent_fk');
  
  IF constraint_count < 2 THEN
    RAISE EXCEPTION 'Migration failed: missing constraints';
  END IF;
  
  RAISE NOTICE '✅ Migration 022 completed successfully';
END$$;

COMMIT;
