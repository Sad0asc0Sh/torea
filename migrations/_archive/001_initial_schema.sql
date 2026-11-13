-- ====================================
-- Migration 001: Initial Database Schema
-- ====================================
-- Creates foundational tables for the ToInfinity platform
-- Safe to run multiple times (idempotent)

BEGIN;

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ====================================
-- Core System Tables
-- ====================================

-- System settings (key-value configuration store)
CREATE TABLE IF NOT EXISTS public.system_settings (
  id SERIAL PRIMARY KEY,
  key TEXT NOT NULL,
  value TEXT,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS system_settings_key_uniq 
  ON public.system_settings (key);

-- Generic updated_at trigger function
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to system_settings
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_system_settings_updated_at') THEN
    CREATE TRIGGER trg_system_settings_updated_at
    BEFORE UPDATE ON public.system_settings
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();
  END IF;
END$$;

-- ====================================
-- Organizational Hierarchy
-- ====================================

-- Org nodes (hierarchical structure:  company, division, region, etc.)
-- NOTE: No is_active field - organizational structure is always active
CREATE TABLE IF NOT EXISTS public.org_nodes (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  parent_id INTEGER REFERENCES public.org_nodes(id) ON DELETE SET NULL,
  node_type TEXT,
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS org_nodes_parent_id_idx 
  ON public.org_nodes (parent_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_org_nodes_updated_at') THEN
    CREATE TRIGGER trg_org_nodes_updated_at
    BEFORE UPDATE ON public.org_nodes
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();
  END IF;
END$$;

-- Org node edges (explicit parent-child relationships)
CREATE TABLE IF NOT EXISTS public.org_node_edges (
  parent_id INTEGER NOT NULL REFERENCES public.org_nodes(id) ON DELETE CASCADE,
  child_id INTEGER NOT NULL REFERENCES public.org_nodes(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (parent_id, child_id)
);

CREATE INDEX IF NOT EXISTS org_node_edges_child_id_idx 
  ON public.org_node_edges (child_id);

-- ====================================
-- User Management
-- ====================================

-- Users table
-- NOTE: active field here controls user activation status
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  accounting_code TEXT,
  phone TEXT,
  telegram_id TEXT,
  verification_code TEXT,
  status TEXT,
  role TEXT NOT NULL DEFAULT 'USER',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  org_node_id INTEGER REFERENCES public.org_nodes(id) ON DELETE SET NULL,
  manager_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT users_role_check CHECK (role IN ('ADMIN', 'MANAGER', 'USER', 'VIEWER'))
);

CREATE INDEX IF NOT EXISTS users_username_idx 
  ON public.users (username);
CREATE INDEX IF NOT EXISTS users_telegram_id_idx 
  ON public.users (telegram_id) WHERE telegram_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS users_org_node_id_idx 
  ON public.users (org_node_id);
CREATE INDEX IF NOT EXISTS users_manager_id_idx 
  ON public.users (manager_id);
CREATE INDEX IF NOT EXISTS users_active_idx 
  ON public.users (active);
CREATE INDEX IF NOT EXISTS users_active_orgnode_idx 
  ON public.users (active, org_node_id);
CREATE INDEX IF NOT EXISTS users_active_username_idx 
  ON public.users (active, username);
CREATE INDEX IF NOT EXISTS users_active_first_last_idx 
  ON public.users (active, first_name, last_name);
CREATE INDEX IF NOT EXISTS users_active_org_first_last_username_idx 
  ON public.users (active, org_node_id, first_name, last_name, username);
CREATE INDEX IF NOT EXISTS users_active_full_name_trgm_idx 
  ON public.users USING gin (
    ((coalesce(first_name,'') || ' ' || coalesce(last_name,''))) gin_trgm_ops
  )
  WHERE active = TRUE;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_users_updated_at') THEN
    CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON public.users
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();
  END IF;
END$$;

-- ====================================
-- Brand & Product Management
-- ====================================

-- Brands
CREATE TABLE IF NOT EXISTS public.brands (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS brands_name_lower_idx 
  ON public.brands (LOWER(name));

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_brands_updated_at') THEN
    CREATE TRIGGER trg_brands_updated_at
    BEFORE UPDATE ON public.brands
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();
  END IF;
END$$;

-- Products
CREATE TABLE IF NOT EXISTS public.products (
  id SERIAL PRIMARY KEY,
  brand_id INTEGER NOT NULL REFERENCES public.brands(id) ON DELETE RESTRICT,
  sku_code TEXT NOT NULL,
  name TEXT NOT NULL,
  unit TEXT,
  pack_size INTEGER,
  barcode TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS products_sku_code_lower_idx 
  ON public.products (LOWER(sku_code));
CREATE INDEX IF NOT EXISTS products_brand_id_idx 
  ON public.products (brand_id);
CREATE INDEX IF NOT EXISTS products_is_active_idx 
  ON public.products (is_active);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_products_updated_at') THEN
    CREATE TRIGGER trg_products_updated_at
    BEFORE UPDATE ON public.products
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();
  END IF;
END$$;

-- ====================================
-- Customer Industries
-- ====================================

-- Customer industries (e.g., restaurant, pharmacy, supermarket)
CREATE TABLE IF NOT EXISTS public.customer_industries (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS customer_industries_name_lower_idx 
  ON public.customer_industries (LOWER(title));

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_customer_industries_updated_at') THEN
    CREATE TRIGGER trg_customer_industries_updated_at
    BEFORE UPDATE ON public.customer_industries
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();
  END IF;
END$$;

-- ====================================
-- Team Management
-- ====================================

-- Teams
-- NOTE: No is_active field - teams are always active, only users can be deactivated
CREATE TABLE IF NOT EXISTS public.teams (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  org_node_id INTEGER REFERENCES public.org_nodes(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS teams_name_lower_idx 
  ON public.teams (LOWER(name));
CREATE INDEX IF NOT EXISTS teams_org_node_id_idx 
  ON public.teams (org_node_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_teams_updated_at') THEN
    CREATE TRIGGER trg_teams_updated_at
    BEFORE UPDATE ON public.teams
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();
  END IF;
END$$;

-- Team users (many-to-many relationship)
CREATE TABLE IF NOT EXISTS public.team_users (
  team_id INTEGER NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'MEMBER',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (team_id, user_id)
);

CREATE INDEX IF NOT EXISTS team_users_user_id_idx 
  ON public.team_users (user_id);
CREATE INDEX IF NOT EXISTS team_users_team_id_idx 
  ON public.team_users (team_id);

-- Team brands (teams can be associated with specific brands)
CREATE TABLE IF NOT EXISTS public.team_brands (
  team_id INTEGER NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  brand_id INTEGER NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (team_id, brand_id)
);

CREATE INDEX IF NOT EXISTS team_brands_brand_id_idx 
  ON public.team_brands (brand_id);

-- User team assignment (single team per user)
CREATE TABLE IF NOT EXISTS public.user_team_assignment (
  user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  team_id INTEGER NOT NULL REFERENCES public.teams(id) ON DELETE RESTRICT,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS user_team_assignment_team_id_idx 
  ON public.user_team_assignment (team_id);

-- Trigger to propagate user_team_assignment into team_users
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
    FOR EACH ROW 
    EXECUTE FUNCTION public.trg_user_team_assignment_propagate_fn();
  END IF;
END$$;

-- ====================================
-- Voice Logs & Recordings
-- ====================================

-- Voice logs (recordings of negotiations)
CREATE TABLE IF NOT EXISTS public.voice_logs (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  customer_id TEXT,
  customer_name TEXT,
  file_path TEXT,
  duration_seconds INTEGER,
  created_at TIMESTAMPTZ,
  transcript TEXT,
  analysis_result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS voice_logs_user_id_idx 
  ON public.voice_logs (user_id);
CREATE INDEX IF NOT EXISTS voice_logs_customer_id_idx 
  ON public.voice_logs (customer_id);
CREATE INDEX IF NOT EXISTS voice_logs_created_at_idx 
  ON public.voice_logs (created_at DESC);

-- ====================================
-- Credit Management
-- ====================================

-- Credit policies per org node
CREATE TABLE IF NOT EXISTS public.credit_policies (
  org_node_id INTEGER PRIMARY KEY REFERENCES public.org_nodes(id) ON DELETE CASCADE,
  max_credit_amount NUMERIC(15,2),
  max_credit_days INTEGER,
  approval_required BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_credit_policies_updated_at') THEN
    CREATE TRIGGER trg_credit_policies_updated_at
    BEFORE UPDATE ON public.credit_policies
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();
  END IF;
END$$;

-- Credit sale requests
CREATE TABLE IF NOT EXISTS public.credit_sale_requests (
  id SERIAL PRIMARY KEY,
  requester_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  customer_id TEXT NOT NULL,
  customer_name TEXT,
  invoice_number TEXT,
  amount NUMERIC(15,2) NOT NULL,
  requested_days INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  requester_note TEXT,
  decision_note TEXT,
  decided_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT credit_sale_requests_status_check 
    CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'))
);

CREATE INDEX IF NOT EXISTS credit_sale_requests_requester_user_id_idx 
  ON public.credit_sale_requests (requester_user_id);
CREATE INDEX IF NOT EXISTS credit_sale_requests_customer_code_idx 
  ON public.credit_sale_requests (customer_code);
CREATE INDEX IF NOT EXISTS credit_sale_requests_final_status_idx 
  ON public.credit_sale_requests (final_status);
CREATE INDEX IF NOT EXISTS credit_sale_requests_created_at_idx 
  ON public.credit_sale_requests (created_at DESC);

-- Credit settlement requests
CREATE TABLE IF NOT EXISTS public.credit_settlement_requests (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  customer_id TEXT NOT NULL,
  amount NUMERIC(15,2) NOT NULL,
  payment_method TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',
  requester_note TEXT,
  decision_note TEXT,
  decision_voice_path TEXT,
  decided_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT credit_settlement_requests_status_check 
    CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'))
);

CREATE INDEX IF NOT EXISTS credit_settlement_requests_requested_by_user_id_idx 
  ON public.credit_settlement_requests (requested_by_user_id);
CREATE INDEX IF NOT EXISTS credit_settlement_requests_credit_request_id_idx 
  ON public.credit_settlement_requests (credit_request_id);
CREATE INDEX IF NOT EXISTS credit_settlement_requests_status_idx 
  ON public.credit_settlement_requests (status);
CREATE INDEX IF NOT EXISTS credit_settlement_requests_created_at_idx 
  ON public.credit_settlement_requests (created_at DESC);

COMMIT;
