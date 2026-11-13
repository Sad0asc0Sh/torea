-- Remove legacy full_name column after code paths switched to first_name/last_name
ALTER TABLE public.users DROP COLUMN IF EXISTS full_name;
