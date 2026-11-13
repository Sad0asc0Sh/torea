BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'voice_logs'
  ) THEN
    ALTER TABLE public.voice_logs
      ADD COLUMN IF NOT EXISTS customer_name TEXT;
    CREATE INDEX IF NOT EXISTS voice_logs_customer_name_idx ON public.voice_logs (customer_name);
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS public.negotiation_analysis_logs (
  id SERIAL PRIMARY KEY,
  user_id TEXT,
  customer_name TEXT NOT NULL,
  audio_id TEXT,
  transcript TEXT NOT NULL,
  summary_25 TEXT,
  key_points JSONB,
  score INT,
  rolling_avg NUMERIC,
  threshold INT DEFAULT 70,
  difficulty_level TEXT,
  current_topic_key TEXT,
  suspicious BOOLEAN DEFAULT FALSE,
  speaker_match_score NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS negotiation_analysis_logs_user_created_idx
  ON public.negotiation_analysis_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS negotiation_analysis_logs_customer_name_idx
  ON public.negotiation_analysis_logs (customer_name);

COMMIT;
