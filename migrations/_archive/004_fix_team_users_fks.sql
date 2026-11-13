-- Align team membership relations with users/teams and add necessary indexes
BEGIN;

-- Ensure team_users.user_id uses UUID and has proper FK
ALTER TABLE public.team_users
  ALTER COLUMN user_id TYPE uuid USING user_id::uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'team_users_user_id_fkey'
      AND conrelid = 'public.team_users'::regclass
  ) THEN
    ALTER TABLE public.team_users
      ADD CONSTRAINT team_users_user_id_fkey
      FOREIGN KEY (user_id)
      REFERENCES public.users(id)
      ON DELETE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'team_users_team_id_fkey'
      AND conrelid = 'public.team_users'::regclass
  ) THEN
    ALTER TABLE public.team_users
      ADD CONSTRAINT team_users_team_id_fkey
      FOREIGN KEY (team_id)
      REFERENCES public.teams(id)
      ON DELETE CASCADE;
  END IF;
END$$;

-- Reassert uniqueness and supporting indexes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'team_users_pkey'
      AND conrelid = 'public.team_users'::regclass
  ) THEN
    ALTER TABLE public.team_users ADD CONSTRAINT team_users_pkey PRIMARY KEY (team_id, user_id);
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_team_users_team_id ON public.team_users(team_id);
CREATE INDEX IF NOT EXISTS idx_team_users_user_id ON public.team_users(user_id);

-- Ensure user_team_assignment.user_id uses UUID and has FK
ALTER TABLE public.user_team_assignment
  ALTER COLUMN user_id TYPE uuid USING user_id::uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_team_assignment_user_id_fkey'
      AND conrelid = 'public.user_team_assignment'::regclass
  ) THEN
    ALTER TABLE public.user_team_assignment
      ADD CONSTRAINT user_team_assignment_user_id_fkey
      FOREIGN KEY (user_id)
      REFERENCES public.users(id)
      ON DELETE CASCADE;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_user_team_assignment_user_id ON public.user_team_assignment(user_id);
CREATE INDEX IF NOT EXISTS idx_user_team_assignment_team_id ON public.user_team_assignment(team_id);

-- Composite user search index to support admin member picker
CREATE INDEX IF NOT EXISTS idx_users_active_org_first_last_username
  ON public.users (active, org_node_id, first_name, last_name, username);

COMMIT;
