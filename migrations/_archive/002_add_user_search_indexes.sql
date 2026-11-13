-- Add indexes to accelerate user search on members page
CREATE INDEX IF NOT EXISTS idx_users_active_orgnode ON public.users (active, org_node_id);
CREATE INDEX IF NOT EXISTS idx_users_active_username ON public.users (active, username);
CREATE INDEX IF NOT EXISTS idx_users_active_first_last ON public.users (active, first_name, last_name);
CREATE INDEX IF NOT EXISTS idx_users_active_full_name ON public.users (active, (CONCAT_WS(' ', first_name, last_name)));
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_users_active_full_name_trgm ON public.users USING gin ((CONCAT_WS(' ', first_name, last_name)) gin_trgm_ops) WHERE active = TRUE;
