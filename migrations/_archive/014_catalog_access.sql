-- Catalog + Hierarchical Access (idempotent)
BEGIN;

-- Ensure generic updated_at trigger function exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'set_updated_at'
      AND pronamespace = 'public'::regnamespace
  ) THEN
    CREATE FUNCTION public.set_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  END IF;
END$$;

-- Catalog items: single source of truth table
CREATE TABLE IF NOT EXISTS public.catalog_items (
  key TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NULL,
  route_admin TEXT NULL,
  route_user TEXT NULL,
  parent_key TEXT NULL,
  order_index INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT catalog_items_type_check CHECK (type IN ('group','page','tool','report','form','setting'))
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'catalog_items_parent_fk'
      AND conrelid = 'public.catalog_items'::regclass
  ) THEN
    ALTER TABLE public.catalog_items
      ADD CONSTRAINT catalog_items_parent_fk
      FOREIGN KEY (parent_key) REFERENCES public.catalog_items(key) ON DELETE SET NULL;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_catalog_items_updated_at'
  ) THEN
    CREATE TRIGGER trg_catalog_items_updated_at
    BEFORE UPDATE ON public.catalog_items
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();
  END IF;
END$$;

-- Org node catalog mode (USER vs ADMIN)
CREATE TABLE IF NOT EXISTS public.org_node_catalog_mode (
  org_node_id BIGINT PRIMARY KEY REFERENCES public.org_nodes(id) ON DELETE CASCADE,
  mode TEXT NOT NULL DEFAULT 'USER',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT org_node_catalog_mode_mode_check CHECK (mode IN ('USER','ADMIN'))
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_org_node_catalog_mode_updated_at'
  ) THEN
    CREATE TRIGGER trg_org_node_catalog_mode_updated_at
    BEFORE UPDATE ON public.org_node_catalog_mode
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();
  END IF;
END$$;

-- Org node -> item access (deny-by-default)
CREATE TABLE IF NOT EXISTS public.org_node_item_access (
  org_node_id BIGINT NOT NULL REFERENCES public.org_nodes(id) ON DELETE CASCADE,
  item_key TEXT NOT NULL REFERENCES public.catalog_items(key) ON DELETE CASCADE,
  visible BOOLEAN NOT NULL DEFAULT FALSE,
  show_on_dashboard BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS org_node_item_access_uniq
  ON public.org_node_item_access(org_node_id, item_key);

CREATE INDEX IF NOT EXISTS org_node_item_access_org_idx
  ON public.org_node_item_access(org_node_id);

CREATE INDEX IF NOT EXISTS org_node_item_access_item_idx
  ON public.org_node_item_access(item_key);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_org_node_item_access_updated_at'
  ) THEN
    CREATE TRIGGER trg_org_node_item_access_updated_at
    BEFORE UPDATE ON public.org_node_item_access
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();
  END IF;
END$$;

COMMIT;
