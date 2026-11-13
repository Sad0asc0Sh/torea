-- Training Priority Engine schema (idempotent)
BEGIN;

-- Ensure generic updated_at trigger function exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'set_updated_at'
      AND pronamespace = 'public'::regnamespace
  ) THEN
    CREATE FUNCTION public.set_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  END IF;
END$$;

-- Company-level training settings
CREATE TABLE IF NOT EXISTS public.training_company_settings (
  id SERIAL PRIMARY KEY,
  company_id uuid,
  baseline_voices_count INTEGER NOT NULL DEFAULT 3,
  rolling_window_n INTEGER NOT NULL DEFAULT 3,
  threshold_score INTEGER NOT NULL DEFAULT 70,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS training_company_settings_company_not_null_idx
  ON public.training_company_settings (company_id)
  WHERE company_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS training_company_settings_singleton_idx
  ON public.training_company_settings ((company_id IS NULL))
  WHERE company_id IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_training_company_settings_updated_at') THEN
    CREATE TRIGGER trg_training_company_settings_updated_at
    BEFORE UPDATE ON public.training_company_settings
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();
  END IF;
END$$;

-- Training topics (per company, ordered)
CREATE TABLE IF NOT EXISTS public.training_topics (
  id SERIAL PRIMARY KEY,
  company_id uuid,
  topic_key TEXT NOT NULL,
  title TEXT,
  order_index INTEGER,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  prompt_simple TEXT,
  prompt_logical TEXT,
  prompt_strict TEXT,
  provider_mode TEXT NOT NULL DEFAULT 'hybrid',
  token TEXT,
  base_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

UPDATE public.training_topics SET is_enabled = TRUE WHERE is_enabled IS NULL;
UPDATE public.training_topics SET provider_mode = 'hybrid' WHERE provider_mode IS NULL;
UPDATE public.training_topics SET created_at = NOW() WHERE created_at IS NULL;
UPDATE public.training_topics SET updated_at = NOW() WHERE updated_at IS NULL;

ALTER TABLE public.training_topics
  ALTER COLUMN topic_key SET NOT NULL,
  ALTER COLUMN is_enabled SET DEFAULT TRUE,
  ALTER COLUMN is_enabled SET NOT NULL,
  ALTER COLUMN provider_mode SET DEFAULT 'hybrid',
  ALTER COLUMN provider_mode SET NOT NULL,
  ALTER COLUMN created_at SET DEFAULT NOW(),
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT NOW(),
  ALTER COLUMN updated_at SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS training_topics_company_topic_key_uniq
  ON public.training_topics (company_id, topic_key)
  WHERE company_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS training_topics_topic_key_singleton
  ON public.training_topics (topic_key)
  WHERE company_id IS NULL;

CREATE INDEX IF NOT EXISTS training_topics_company_order_idx
  ON public.training_topics (company_id, order_index);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_training_topics_updated_at') THEN
    CREATE TRIGGER trg_training_topics_updated_at
    BEFORE UPDATE ON public.training_topics
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();
  END IF;
END$$;

-- Per-user training state
CREATE TABLE IF NOT EXISTS public.user_training_state (
  user_id uuid NOT NULL,
  user_level INTEGER NOT NULL DEFAULT 1,
  difficulty_level TEXT,
  baseline_done BOOLEAN NOT NULL DEFAULT FALSE,
  baseline_voice_count INTEGER NOT NULL DEFAULT 0,
  current_topic_key TEXT,
  cycle_id INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

UPDATE public.user_training_state SET user_level = 1 WHERE user_level IS NULL;
UPDATE public.user_training_state SET baseline_done = FALSE WHERE baseline_done IS NULL;
UPDATE public.user_training_state SET baseline_voice_count = 0 WHERE baseline_voice_count IS NULL;
UPDATE public.user_training_state SET cycle_id = 1 WHERE cycle_id IS NULL;
UPDATE public.user_training_state SET updated_at = NOW() WHERE updated_at IS NULL;

ALTER TABLE public.user_training_state
  ALTER COLUMN user_id SET NOT NULL,
  ALTER COLUMN user_level SET DEFAULT 1,
  ALTER COLUMN user_level SET NOT NULL,
  ALTER COLUMN baseline_done SET DEFAULT FALSE,
  ALTER COLUMN baseline_done SET NOT NULL,
  ALTER COLUMN baseline_voice_count SET DEFAULT 0,
  ALTER COLUMN baseline_voice_count SET NOT NULL,
  ALTER COLUMN cycle_id SET DEFAULT 1,
  ALTER COLUMN cycle_id SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT NOW(),
  ALTER COLUMN updated_at SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_training_state_pkey'
      AND conrelid = 'public.user_training_state'::regclass
  ) THEN
    ALTER TABLE public.user_training_state
      ADD CONSTRAINT user_training_state_pkey PRIMARY KEY (user_id);
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_training_state_user_id_fkey'
      AND conrelid = 'public.user_training_state'::regclass
  ) THEN
    ALTER TABLE public.user_training_state
      ADD CONSTRAINT user_training_state_user_id_fkey
      FOREIGN KEY (user_id)
      REFERENCES public.users(id)
      ON DELETE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_user_training_state_updated_at') THEN
    CREATE TRIGGER trg_user_training_state_updated_at
    BEFORE UPDATE ON public.user_training_state
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();
  END IF;
END$$;

-- Training scores per topic/voice
CREATE TABLE IF NOT EXISTS public.training_scores (
  id SERIAL PRIMARY KEY,
  user_id uuid NOT NULL,
  topic_key TEXT NOT NULL,
  voice_log_id TEXT,
  score INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

UPDATE public.training_scores SET created_at = NOW() WHERE created_at IS NULL;

ALTER TABLE public.training_scores
  ALTER COLUMN user_id SET NOT NULL,
  ALTER COLUMN topic_key SET NOT NULL,
  ALTER COLUMN score SET NOT NULL,
  ALTER COLUMN created_at SET DEFAULT NOW(),
  ALTER COLUMN created_at SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'training_scores_user_id_fkey'
      AND conrelid = 'public.training_scores'::regclass
  ) THEN
    ALTER TABLE public.training_scores
      ADD CONSTRAINT training_scores_user_id_fkey
      FOREIGN KEY (user_id)
      REFERENCES public.users(id)
      ON DELETE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'training_scores_score_range'
      AND conrelid = 'public.training_scores'::regclass
  ) THEN
    ALTER TABLE public.training_scores
      ADD CONSTRAINT training_scores_score_range
      CHECK (score >= 0 AND score <= 100);
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS training_scores_user_topic_created_idx
  ON public.training_scores (user_id, topic_key, created_at DESC);

-- Voice enrollment embeddings per user
CREATE TABLE IF NOT EXISTS public.voice_enrollment (
  user_id uuid NOT NULL,
  enrollment_version INTEGER NOT NULL DEFAULT 1,
  embedding_json TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

UPDATE public.voice_enrollment SET enrollment_version = 1 WHERE enrollment_version IS NULL;
UPDATE public.voice_enrollment SET created_at = NOW() WHERE created_at IS NULL;
UPDATE public.voice_enrollment SET updated_at = NOW() WHERE updated_at IS NULL;

ALTER TABLE public.voice_enrollment
  ALTER COLUMN user_id SET NOT NULL,
  ALTER COLUMN enrollment_version SET DEFAULT 1,
  ALTER COLUMN enrollment_version SET NOT NULL,
  ALTER COLUMN created_at SET DEFAULT NOW(),
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT NOW(),
  ALTER COLUMN updated_at SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'voice_enrollment_pkey'
      AND conrelid = 'public.voice_enrollment'::regclass
  ) THEN
    ALTER TABLE public.voice_enrollment
      ADD CONSTRAINT voice_enrollment_pkey PRIMARY KEY (user_id, enrollment_version);
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'voice_enrollment_user_id_fkey'
      AND conrelid = 'public.voice_enrollment'::regclass
  ) THEN
    ALTER TABLE public.voice_enrollment
      ADD CONSTRAINT voice_enrollment_user_id_fkey
      FOREIGN KEY (user_id)
      REFERENCES public.users(id)
      ON DELETE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_voice_enrollment_updated_at') THEN
    CREATE TRIGGER trg_voice_enrollment_updated_at
    BEFORE UPDATE ON public.voice_enrollment
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();
  END IF;
END$$;

COMMIT;
