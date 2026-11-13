-- Idempotent consistency migration for teams/assignments
-- Focus: ensure teams.org_node_id exists, canonical team_users columns, and single-team mapping.

BEGIN;

-- Ensure teams table and org_node_id linkage
CREATE TABLE IF NOT EXISTS public.teams (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  org_node_id INTEGER,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS org_node_id INTEGER;
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS active BOOLEAN;
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

UPDATE public.teams SET active = COALESCE(active, TRUE);
UPDATE public.teams SET created_at = COALESCE(created_at, NOW());
UPDATE public.teams SET updated_at = COALESCE(updated_at, NOW());

ALTER TABLE public.teams
  ALTER COLUMN active SET DEFAULT TRUE,
  ALTER COLUMN active SET NOT NULL,
  ALTER COLUMN created_at SET DEFAULT NOW(),
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT NOW(),
  ALTER COLUMN updated_at SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'teams_org_node_id_fkey'
      AND conrelid = 'public.teams'::regclass
  ) THEN
    ALTER TABLE public.teams
      ADD CONSTRAINT teams_org_node_id_fkey
      FOREIGN KEY (org_node_id)
      REFERENCES public.org_nodes(id)
      ON DELETE SET NULL;
  END IF;
END$$;

CREATE UNIQUE INDEX IF NOT EXISTS teams_name_lower_idx ON public.teams (LOWER(name));
CREATE INDEX IF NOT EXISTS teams_org_node_id_idx ON public.teams (org_node_id);

-- Generic updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_teams_updated_at') THEN
    CREATE TRIGGER trg_teams_updated_at
    BEFORE UPDATE ON public.teams
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS public.team_users (
  team_id INTEGER NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'MEMBER',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (team_id, user_id)
);

ALTER TABLE public.team_users
  ADD COLUMN IF NOT EXISTS role TEXT;
ALTER TABLE public.team_users ALTER COLUMN role SET DEFAULT 'MEMBER';
ALTER TABLE public.team_users ADD COLUMN IF NOT EXISTS active BOOLEAN;
ALTER TABLE public.team_users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;
UPDATE public.team_users SET active = COALESCE(active, TRUE);
UPDATE public.team_users SET created_at = COALESCE(created_at, NOW());
ALTER TABLE public.team_users
  ALTER COLUMN active SET DEFAULT TRUE,
  ALTER COLUMN active SET NOT NULL,
  ALTER COLUMN created_at SET DEFAULT NOW(),
  ALTER COLUMN created_at SET NOT NULL;
UPDATE public.team_users SET role = 'MEMBER' WHERE role IS DISTINCT FROM 'MEMBER';
ALTER TABLE public.team_users ALTER COLUMN role SET NOT NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'team_users_pkey' AND conrelid = 'public.team_users'::regclass) THEN
    ALTER TABLE public.team_users DROP CONSTRAINT team_users_pkey;
  END IF;
  BEGIN
    ALTER TABLE public.team_users ADD CONSTRAINT team_users_pkey PRIMARY KEY (team_id, user_id);
  EXCEPTION WHEN duplicate_object THEN
    -- already aligned
    NULL;
  END;
END$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'team_users_role_valid'
      AND conrelid = 'public.team_users'::regclass
  ) THEN
    ALTER TABLE public.team_users DROP CONSTRAINT team_users_role_valid;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'team_users_role_member_only'
      AND conrelid = 'public.team_users'::regclass
  ) THEN
    ALTER TABLE public.team_users
      ADD CONSTRAINT team_users_role_member_only
      CHECK (UPPER(role) = 'MEMBER')
      NOT VALID;
  END IF;
END$$;

DO $$
BEGIN
  BEGIN
    ALTER TABLE public.team_users VALIDATE CONSTRAINT team_users_role_member_only;
  EXCEPTION WHEN others THEN
    NULL;
  END;
END$$;

CREATE INDEX IF NOT EXISTS team_users_user_id_idx ON public.team_users(user_id);
CREATE INDEX IF NOT EXISTS team_users_team_id_idx ON public.team_users(team_id);

-- Canonical mapping: one team per user (no per-team roles)
CREATE TABLE IF NOT EXISTS public.user_team_assignment (
  user_id TEXT NOT NULL,
  team_id INTEGER NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.user_team_assignment DROP COLUMN IF EXISTS role;
ALTER TABLE public.user_team_assignment DROP COLUMN IF EXISTS active;
ALTER TABLE public.user_team_assignment ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;
ALTER TABLE public.user_team_assignment ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
UPDATE public.user_team_assignment SET created_at = COALESCE(created_at, NOW());
UPDATE public.user_team_assignment SET updated_at = COALESCE(updated_at, NOW());
ALTER TABLE public.user_team_assignment
  ALTER COLUMN created_at SET DEFAULT NOW(),
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT NOW(),
  ALTER COLUMN updated_at SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_team_assignment_user_unique'
      AND conrelid = 'public.user_team_assignment'::regclass
  ) THEN
    ALTER TABLE public.user_team_assignment
      ADD CONSTRAINT user_team_assignment_user_unique UNIQUE (user_id);
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS user_team_assignment_team_idx ON public.user_team_assignment(team_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_user_team_assignment_updated_at') THEN
    CREATE TRIGGER trg_user_team_assignment_updated_at
    BEFORE UPDATE ON public.user_team_assignment
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();
  END IF;
END$$;

-- Propagate user_team_assignment changes into team_users (role fixed to MEMBER)
CREATE OR REPLACE FUNCTION public.trg_user_team_assignment_propagate_fn()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.team_users tu
    WHERE tu.team_id = OLD.team_id
      AND tu.user_id = OLD.user_id;
    RETURN OLD;
  END IF;

  INSERT INTO public.team_users (team_id, user_id, role, active)
  VALUES (NEW.team_id, NEW.user_id, 'MEMBER', TRUE)
  ON CONFLICT (team_id, user_id) DO UPDATE
    SET active = TRUE,
        role = 'MEMBER';

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_user_team_assignment_propagate') THEN
    CREATE TRIGGER trg_user_team_assignment_propagate
    AFTER INSERT OR UPDATE OR DELETE ON public.user_team_assignment
    FOR EACH ROW EXECUTE FUNCTION public.trg_user_team_assignment_propagate_fn();
  END IF;
END$$;

COMMIT;
