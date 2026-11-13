BEGIN;

-- Core catalog of reports
CREATE TABLE IF NOT EXISTS public.report_catalog (
  key TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NULL,
  scope TEXT NOT NULL,
  group_key TEXT NOT NULL,
  order_index INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sources TEXT[] NOT NULL DEFAULT '{}'::text[],
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure columns exist (idempotent backfill)
ALTER TABLE public.report_catalog
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS group_key TEXT NOT NULL DEFAULT 'my',
  ADD COLUMN IF NOT EXISTS order_index INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS sources TEXT[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS config JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'report_catalog_scope_check') THEN
    ALTER TABLE public.report_catalog
      ADD CONSTRAINT report_catalog_scope_check
      CHECK (scope IN ('MY','TEAM','RIVALS','COMPANY'));
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'report_catalog_group_key_check') THEN
    ALTER TABLE public.report_catalog
      ADD CONSTRAINT report_catalog_group_key_check
      CHECK (group_key IN ('my','team','rivals','company'));
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_report_catalog_updated_at') THEN
    CREATE TRIGGER trg_report_catalog_updated_at
    BEFORE UPDATE ON public.report_catalog
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();
  END IF;
END$$;

-- Widgets per report
CREATE TABLE IF NOT EXISTS public.report_widget_catalog (
  id SERIAL PRIMARY KEY,
  report_key TEXT REFERENCES public.report_catalog(key) ON DELETE CASCADE,
  widget_key TEXT,
  title TEXT,
  chart_type TEXT,
  unit TEXT NULL,
  query_id TEXT,
  order_index INT DEFAULT 0,
  config JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.report_widget_catalog
  ADD COLUMN IF NOT EXISTS report_key TEXT,
  ADD COLUMN IF NOT EXISTS widget_key TEXT,
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS chart_type TEXT,
  ADD COLUMN IF NOT EXISTS unit TEXT NULL,
  ADD COLUMN IF NOT EXISTS query_id TEXT,
  ADD COLUMN IF NOT EXISTS order_index INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS config JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'report_widget_catalog_report_key_fkey'
  ) THEN
    ALTER TABLE public.report_widget_catalog
      ADD CONSTRAINT report_widget_catalog_report_key_fkey
      FOREIGN KEY (report_key)
      REFERENCES public.report_catalog(key)
      ON DELETE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_report_widget_catalog_updated_at') THEN
    CREATE TRIGGER trg_report_widget_catalog_updated_at
    BEFORE UPDATE ON public.report_widget_catalog
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_report_widget_catalog_report_order
  ON public.report_widget_catalog (report_key, order_index, id);

COMMIT;
