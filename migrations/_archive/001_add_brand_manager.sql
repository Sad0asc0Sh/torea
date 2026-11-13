-- Idempotent migration: add manager_user_id to brands
BEGIN;

ALTER TABLE public.brands
  ADD COLUMN IF NOT EXISTS manager_user_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'brands_manager_user_id_fkey'
      AND conrelid = 'public.brands'::regclass
  ) THEN
    ALTER TABLE public.brands
      ADD CONSTRAINT brands_manager_user_id_fkey
      FOREIGN KEY (manager_user_id)
      REFERENCES public.users(id)
      ON DELETE SET NULL;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS brands_manager_user_id_idx ON public.brands (manager_user_id);

COMMIT;
