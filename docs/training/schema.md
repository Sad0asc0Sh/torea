# Training Priority Engine Schema

This module persists configuration and scoring data for the training priority engine. All tables are created idempotently via `migrations/005_training_priority_engine.sql`.

## Tables

- **training_company_settings**
  - Columns: `company_id` (nullable, UUID), `baseline_voices_count` (default 3), `rolling_window_n` (default 3), `threshold_score` (default 70), timestamps.
  - Keys: unique partial index on `company_id` when present, plus a singleton partial index for rows where `company_id` is NULL to enforce one settings row in single-tenant mode. `updated_at` trigger uses `public.set_updated_at`.

- **training_topics**
  - Columns: `company_id` (nullable, UUID), `topic_key` (text), `title`, `order_index`, `is_enabled` (default true), prompts (`prompt_simple`, `prompt_logical`, `prompt_strict`), `provider_mode` (default `hybrid`), `token`, `base_url`, timestamps.
  - Keys: unique `(company_id, topic_key)` when `company_id` is present; unique `topic_key` when `company_id` is null; index on `(company_id, order_index)` for ordering. `updated_at` trigger enabled.

- **user_training_state**
  - Columns: `user_id` (UUID PK/FK → users.id), `user_level` (default 1), `difficulty_level` (simple/logical/strict), `baseline_done` (default false), `baseline_voice_count` (default 0), `current_topic_key`, `cycle_id` (default 1), `updated_at`.
  - Keys: primary key on `user_id`; `updated_at` trigger enabled.

- **training_scores**
  - Columns: `user_id` (UUID FK → users.id), `topic_key`, `voice_log_id` (nullable reference to recorded voice), `score` (0–100 with check constraint), `created_at`.
  - Keys/Indexes: primary key `id` (serial); index on `(user_id, topic_key, created_at DESC)` for rolling-window lookups.

- **voice_enrollment**
  - Columns: `user_id` (UUID FK → users.id), `enrollment_version` (default 1), `embedding_json` (text/json payload), timestamps.
  - Keys: composite primary key `(user_id, enrollment_version)`; `updated_at` trigger enabled.
