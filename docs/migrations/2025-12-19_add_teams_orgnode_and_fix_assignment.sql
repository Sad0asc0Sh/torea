-- Safe migration: add teams.org_node_id and align user_team_assignment trigger without team roles
BEGIN;

-- Task A: ensure teams.org_node_id exists and is linked to org_nodes
ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS org_node_id INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
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

CREATE INDEX IF NOT EXISTS teams_org_node_id_idx ON public.teams (org_node_id);

-- Task B: propagate assignments into team_users with fixed role
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
