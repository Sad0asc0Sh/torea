CREATE TABLE IF NOT EXISTS public.automation_topics (
  id SERIAL PRIMARY KEY,
  title VARCHAR NOT NULL,
  is_for_request BOOLEAN DEFAULT false,
  is_for_referral BOOLEAN DEFAULT false,
  is_for_announcement BOOLEAN DEFAULT false,
  draft_template TEXT NULL,
  is_active BOOLEAN DEFAULT true,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT now()
);
