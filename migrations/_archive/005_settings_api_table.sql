-- Admin Settings: API Topics and Prompts (idempotent, add-only)
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

-- Settings: API topics
CREATE TABLE IF NOT EXISTS public.settings_api_topics (
  id SERIAL PRIMARY KEY,
  topic_key TEXT NOT NULL,
  title_fa TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  provider_mode TEXT NOT NULL DEFAULT 'hybrid',
  provider_model TEXT NULL,
  token TEXT NULL,
  base_url TEXT NULL,
  educational_priority INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'settings_api_topics_topic_key_key'
      AND conrelid = 'public.settings_api_topics'::regclass
  ) THEN
    ALTER TABLE public.settings_api_topics
      ADD CONSTRAINT settings_api_topics_topic_key_key UNIQUE (topic_key);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'settings_api_topics_topic_key_lowercase'
      AND conrelid = 'public.settings_api_topics'::regclass
  ) THEN
    ALTER TABLE public.settings_api_topics
      ADD CONSTRAINT settings_api_topics_topic_key_lowercase CHECK (topic_key = LOWER(topic_key));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'settings_api_topics_provider_mode_check'
      AND conrelid = 'public.settings_api_topics'::regclass
  ) THEN
    -- Provider mode values aligned with default 'hybrid'
    ALTER TABLE public.settings_api_topics
      ADD CONSTRAINT settings_api_topics_provider_mode_check CHECK (provider_mode IN ('cloud','local','hybrid'));
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS settings_api_topics_enabled_idx
  ON public.settings_api_topics (enabled);

CREATE INDEX IF NOT EXISTS settings_api_topics_educational_priority_idx
  ON public.settings_api_topics (educational_priority);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_settings_api_topics_updated_at') THEN
    CREATE TRIGGER trg_settings_api_topics_updated_at
    BEFORE UPDATE ON public.settings_api_topics
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();
  END IF;
END$$;

-- Settings: API prompts per topic/level
CREATE TABLE IF NOT EXISTS public.settings_api_prompts (
  id SERIAL PRIMARY KEY,
  topic_key TEXT NOT NULL,
  level TEXT NOT NULL,
  prompt TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'settings_api_prompts_level_check'
      AND conrelid = 'public.settings_api_prompts'::regclass
  ) THEN
    -- Prompt levels align with seeded placeholders below
    ALTER TABLE public.settings_api_prompts
      ADD CONSTRAINT settings_api_prompts_level_check CHECK (level IN ('simple','logical','strict'));
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'settings_api_prompts_topic_key_fkey'
      AND conrelid = 'public.settings_api_prompts'::regclass
  ) THEN
    -- Prompts reference topic_key as the stable business key
    ALTER TABLE public.settings_api_prompts
      ADD CONSTRAINT settings_api_prompts_topic_key_fkey
      FOREIGN KEY (topic_key)
      REFERENCES public.settings_api_topics(topic_key)
      ON DELETE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'settings_api_prompts_topic_key_lowercase'
      AND conrelid = 'public.settings_api_prompts'::regclass
  ) THEN
    ALTER TABLE public.settings_api_prompts
      ADD CONSTRAINT settings_api_prompts_topic_key_lowercase CHECK (topic_key = LOWER(topic_key));
  END IF;
END$$;

-- Unique prompts per topic/level (topic_key leading for fast lookups)
CREATE UNIQUE INDEX IF NOT EXISTS settings_api_prompts_topic_level_uniq
  ON public.settings_api_prompts (topic_key, level);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_settings_api_prompts_updated_at') THEN
    CREATE TRIGGER trg_settings_api_prompts_updated_at
    BEFORE UPDATE ON public.settings_api_prompts
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();
  END IF;
END$$;

-- Seed default topics (idempotent)
INSERT INTO public.settings_api_topics (topic_key, title_fa, provider_mode, educational_priority)
SELECT v.topic_key, v.title_fa, v.provider_mode, v.educational_priority
FROM (VALUES
  -- Top priorities may intentionally tie
  -- Gaps leave room for future insertions without reordering
  ('stt', 'تبدیل ویس به متن', 'hybrid', 1),
  ('negotiation_analysis', 'تحلیل مذاکره', 'hybrid', 1),
  ('negotiation_practice', 'تمرین مذاکره', 'hybrid', 2),
  ('speech', 'فن بیان', 'hybrid', 10),
  ('tone', 'لحن', 'hybrid', 11),
  ('strategic_products', 'کالاهای استراتژیک', 'hybrid', 12)
) AS v(topic_key, title_fa, provider_mode, educational_priority)
WHERE NOT EXISTS (
  SELECT 1 FROM public.settings_api_topics t
  WHERE t.topic_key = v.topic_key
);

-- Seed prompt placeholders for each topic/level (idempotent)
INSERT INTO public.settings_api_prompts (topic_key, level, prompt)
SELECT payload.topic_key, payload.level, payload.prompt
FROM (
  SELECT topics.topic_key, levels.level, levels.prompt
  FROM (VALUES
    ('stt'),
    ('negotiation_analysis'),
    ('negotiation_practice'),
    ('speech'),
    ('tone'),
    ('strategic_products')
  ) AS topics(topic_key)
  CROSS JOIN (VALUES
    ('simple', 'کوتاه و مهربان'),
    ('logical', 'دقیق و منطقی'),
    ('strict', 'سختگیر و آموزشی')
  ) AS levels(level, prompt)
) AS payload
WHERE NOT EXISTS (
  SELECT 1 FROM public.settings_api_prompts p
  WHERE p.topic_key = payload.topic_key
    AND p.level = payload.level
);

COMMIT;
