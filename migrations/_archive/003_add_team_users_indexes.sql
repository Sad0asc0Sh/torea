-- Add indexes for team_users table to improve JOIN performance
CREATE INDEX IF NOT EXISTS idx_team_users_team_id ON public.team_users(team_id);
CREATE INDEX IF NOT EXISTS idx_team_users_user_id ON public.team_users(user_id);
-- Index on users.active helps with searchActiveUsers filtering (WHERE active = true)
CREATE INDEX IF NOT EXISTS idx_users_active ON public.users(active) WHERE active = true;
