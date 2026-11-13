BEGIN;

-- Normalize negotiation_analysis_reports structure for voice-first admin tool
CREATE TABLE IF NOT EXISTS public.negotiation_analysis_reports (
  id SERIAL PRIMARY KEY,
  created_by_user_id INT REFERENCES users(id) NOT NULL,
  customer_name TEXT NOT NULL,
  customer_code TEXT NULL,
  customer_industry_id INT NULL REFERENCES customer_industries(id),
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ NOT NULL,
  duration_seconds INT NOT NULL,
  location_lat DOUBLE PRECISION NULL,
  location_lng DOUBLE PRECISION NULL,
  location_accuracy DOUBLE PRECISION NULL,
  address_auto TEXT NULL,
  address_final TEXT NULL,
  transcript_text TEXT NULL,
  score INT NOT NULL CHECK (score BETWEEN 0 AND 100),
  weakness_focus TEXT NULL,
  exercises JSONB NULL,
  missed_strategic_products JSONB NULL,
  manager_summary_25 TEXT NULL,
  manager_key_points JSONB NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'negotiation_analysis_reports'
  ) THEN
    ALTER TABLE public.negotiation_analysis_reports
      ADD COLUMN IF NOT EXISTS created_by_user_id INT REFERENCES users(id),
      ADD COLUMN IF NOT EXISTS customer_code TEXT,
      ADD COLUMN IF NOT EXISTS customer_industry_id INT REFERENCES customer_industries(id),
      ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS duration_seconds INT,
      ADD COLUMN IF NOT EXISTS location_lat DOUBLE PRECISION,
      ADD COLUMN IF NOT EXISTS location_lng DOUBLE PRECISION,
      ADD COLUMN IF NOT EXISTS location_accuracy DOUBLE PRECISION,
      ADD COLUMN IF NOT EXISTS address_auto TEXT,
      ADD COLUMN IF NOT EXISTS address_final TEXT,
      ADD COLUMN IF NOT EXISTS transcript_text TEXT,
      ADD COLUMN IF NOT EXISTS score INT,
      ADD COLUMN IF NOT EXISTS weakness_focus TEXT,
      ADD COLUMN IF NOT EXISTS exercises JSONB,
      ADD COLUMN IF NOT EXISTS missed_strategic_products JSONB,
      ADD COLUMN IF NOT EXISTS manager_summary_25 TEXT,
      ADD COLUMN IF NOT EXISTS manager_key_points JSONB,
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

    -- Attempt to backfill created_by_user_id from legacy user_id if available
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'negotiation_analysis_reports' AND column_name = 'user_id'
    ) THEN
      BEGIN
        UPDATE public.negotiation_analysis_reports
           SET created_by_user_id = COALESCE(
             created_by_user_id,
             CASE
               WHEN user_id IS NOT NULL AND user_id ~ '^[0-9]+$' THEN NULLIF(user_id::int, 0)
               ELSE NULL
             END
           )
         WHERE created_by_user_id IS NULL;
      EXCEPTION WHEN others THEN
        RAISE NOTICE 'Backfill created_by_user_id skipped: %', SQLERRM;
      END;
    END IF;

    BEGIN
      ALTER TABLE public.negotiation_analysis_reports
        ALTER COLUMN created_by_user_id SET NOT NULL,
        ALTER COLUMN started_at SET NOT NULL,
        ALTER COLUMN ended_at SET NOT NULL,
        ALTER COLUMN duration_seconds SET NOT NULL,
        ALTER COLUMN score SET NOT NULL;
    EXCEPTION WHEN others THEN NULL;
    END;

    -- Ensure score range constraint exists
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'negotiation_analysis_reports_score_check'
        AND conrelid = 'negotiation_analysis_reports'::regclass
    ) THEN
      ALTER TABLE public.negotiation_analysis_reports
        ADD CONSTRAINT negotiation_analysis_reports_score_check CHECK (score BETWEEN 0 AND 100);
    END IF;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS negotiation_analysis_reports_created_user_idx
  ON public.negotiation_analysis_reports (created_by_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS negotiation_analysis_reports_created_idx2
  ON public.negotiation_analysis_reports (created_at DESC);

COMMIT;
