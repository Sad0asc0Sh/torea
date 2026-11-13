-- Automation items + recipients + notifications + admin_settings (STT config)

CREATE TABLE IF NOT EXISTS public.admin_settings (
  id SERIAL PRIMARY KEY,
  subject VARCHAR NOT NULL,
  key VARCHAR NOT NULL,
  value TEXT NULL,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  UNIQUE(subject, key)
);

CREATE TABLE IF NOT EXISTS public.automation_items (
  id SERIAL PRIMARY KEY,
  item_type VARCHAR NOT NULL,
  topic_id INT REFERENCES automation_topics(id),
  created_by_user_id INT REFERENCES users(id),
  target_user_id INT NULL REFERENCES users(id),
  target_org_node_id INT NULL REFERENCES org_nodes(id),
  voice_path TEXT NULL,
  transcript_text TEXT NULL,
  body_text TEXT NULL,
  stt_model_key VARCHAR NULL,
  status VARCHAR NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','done')),
  approver_user_id INT NULL REFERENCES users(id),
  decision_note TEXT NULL,
  decision_voice_path TEXT NULL,
  decided_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_automation_items_status ON public.automation_items(status);
CREATE INDEX IF NOT EXISTS idx_automation_items_approver ON public.automation_items(approver_user_id);

CREATE TABLE IF NOT EXISTS public.automation_item_recipients (
  id SERIAL PRIMARY KEY,
  item_id INT REFERENCES automation_items(id) ON DELETE CASCADE,
  user_id INT REFERENCES users(id),
  read_at TIMESTAMP NULL
);

CREATE INDEX IF NOT EXISTS idx_air_item_user ON public.automation_item_recipients(item_id, user_id);

CREATE TABLE IF NOT EXISTS public.notifications (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id),
  notif_type VARCHAR NOT NULL,
  title VARCHAR NOT NULL,
  body TEXT NULL,
  entity_type VARCHAR NULL,
  entity_id INT NULL,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
