BEGIN;

CREATE TABLE IF NOT EXISTS public.negotiation_analysis_reports (
  id SERIAL PRIMARY KEY,
  user_id uuid,
  customer_name TEXT NOT NULL,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  accuracy_m DOUBLE PRECISION,
  geo_timestamp TIMESTAMP,
  audio_id TEXT,
  duration_seconds INT,
  transcript TEXT,
  summary_25 TEXT,
  key_points JSONB,
  weakness_focus TEXT,
  negotiation_score INT,
  exercises JSONB,
  forgotten_strategic_products JSONB,
  suspicious BOOLEAN DEFAULT FALSE,
  speaker_match_score DOUBLE PRECISION,
  created_at TIMESTAMP DEFAULT NOW()
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'negotiation_analysis_reports'
  ) THEN
    ALTER TABLE public.negotiation_analysis_reports
      ADD COLUMN IF NOT EXISTS user_id uuid,
      ADD COLUMN IF NOT EXISTS customer_name TEXT NOT NULL,
      ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION,
      ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION,
      ADD COLUMN IF NOT EXISTS accuracy_m DOUBLE PRECISION,
      ADD COLUMN IF NOT EXISTS geo_timestamp TIMESTAMP,
      ADD COLUMN IF NOT EXISTS audio_id TEXT,
      ADD COLUMN IF NOT EXISTS duration_seconds INT,
      ADD COLUMN IF NOT EXISTS transcript TEXT,
      ADD COLUMN IF NOT EXISTS summary_25 TEXT,
      ADD COLUMN IF NOT EXISTS key_points JSONB,
      ADD COLUMN IF NOT EXISTS weakness_focus TEXT,
      ADD COLUMN IF NOT EXISTS negotiation_score INT,
      ADD COLUMN IF NOT EXISTS exercises JSONB,
      ADD COLUMN IF NOT EXISTS forgotten_strategic_products JSONB,
      ADD COLUMN IF NOT EXISTS suspicious BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS speaker_match_score DOUBLE PRECISION,
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();
    BEGIN
      ALTER TABLE public.negotiation_analysis_reports
        ALTER COLUMN customer_name SET NOT NULL;
    EXCEPTION
      WHEN others THEN
        -- if existing nulls prevent NOT NULL, keep nullable to avoid failure
        NULL;
    END;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS negotiation_analysis_reports_user_created_idx
  ON public.negotiation_analysis_reports (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS negotiation_analysis_reports_customer_name_idx
  ON public.negotiation_analysis_reports (customer_name);

CREATE INDEX IF NOT EXISTS negotiation_analysis_reports_created_idx
  ON public.negotiation_analysis_reports (created_at DESC);

COMMIT;
