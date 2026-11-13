-- Fix Catalog Access Control Security Issues
-- This migration is idempotent and safe to run multiple times

BEGIN;

-- ==============================================================================
-- Fix #1: Ensure all users have org_node_id (except System Admins)
-- ==============================================================================

DO $$
DECLARE
  default_org_node_id INTEGER;
  users_without_org_node INTEGER;
BEGIN
  -- Find a default org_node (lowest level, first by ID)
  SELECT id INTO default_org_node_id 
  FROM org_nodes 
  WHERE branch = 'ORG' OR branch IS NULL
  ORDER BY COALESCE(level, 999) ASC, id ASC 
  LIMIT 1;
  
  IF default_org_node_id IS NULL THEN
    RAISE NOTICE 'No org_nodes found, skipping user org_node_id fix. You must create org_nodes first.';
  ELSE
    -- Count users without org_node_id
    SELECT COUNT(*) INTO users_without_org_node
    FROM users 
    WHERE org_node_id IS NULL 
      AND UPPER(COALESCE(role, '')) != 'SYSTEM_ADMIN';
    
    IF users_without_org_node > 0 THEN
      RAISE NOTICE 'SECURITY FIX: Found % users without org_node_id, setting to default org_node: %', 
        users_without_org_node, default_org_node_id;
      
      UPDATE users 
      SET org_node_id = default_org_node_id
      WHERE org_node_id IS NULL 
        AND UPPER(COALESCE(role, '')) != 'SYSTEM_ADMIN';
      
      RAISE NOTICE 'SECURITY FIX: Updated % users with default org_node_id', users_without_org_node;
    ELSE
      RAISE NOTICE 'All non-system-admin users already have org_node_id';
    END IF;
  END IF;
END $$;

-- ==============================================================================
-- Fix #2: Remove mode='ADMIN' from org_node_catalog_mode
-- (This mode is only valid for System Admins, not for org_nodes)
-- ==============================================================================

DO $$
DECLARE
  admin_mode_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO admin_mode_count
  FROM org_node_catalog_mode 
  WHERE mode = 'ADMIN';
  
  IF admin_mode_count > 0 THEN
    RAISE NOTICE 'SECURITY FIX: Found % org_nodes with mode=ADMIN, resetting to USER', admin_mode_count;
    
    UPDATE org_node_catalog_mode 
    SET mode = 'USER' 
    WHERE mode = 'ADMIN';
    
    RAISE NOTICE 'SECURITY FIX: Reset % org_node_catalog_mode.mode to USER', admin_mode_count;
  ELSE
    RAISE NOTICE 'No org_nodes with mode=ADMIN found';
  END IF;
END $$;

-- ==============================================================================
-- Add helpful comments
-- ==============================================================================

COMMENT ON TABLE org_node_catalog_mode IS 
  'Catalog mode per org_node: USER (restricted by org_node_item_access). ' ||
  'Mode=ADMIN is deprecated and should not be used for org_nodes.';

COMMENT ON COLUMN org_node_catalog_mode.mode IS 
  'USER: restricted access based on org_node_item_access | ' ||
  'ADMIN: DEPRECATED - do not use for org_nodes, only System Admins have full access';

COMMENT ON COLUMN users.org_node_id IS 
  'سمت سازمانی کاربر - REQUIRED for all non-system-admin users (security: users without org_node_id will be denied access)';

-- ==============================================================================
-- Add constraint to enforce org_node_id (optional - for future data integrity)
-- ==============================================================================

-- Uncomment this if you want to enforce at database level:
-- ALTER TABLE users 
-- ADD CONSTRAINT users_must_have_org_node_check
-- CHECK (org_node_id IS NOT NULL OR UPPER(COALESCE(role, '')) = 'SYSTEM_ADMIN');

COMMIT;

-- ==============================================================================
-- Verification Queries
-- ==============================================================================

-- Run these to verify the fix:
-- 1. Check users without org_node_id (should only be system admins or none)
-- SELECT id, username, role, org_node_id FROM users WHERE org_node_id IS NULL;

-- 2. Check org_node_catalog_mode (should have no mode='ADMIN')
-- SELECT * FROM org_node_catalog_mode WHERE mode = 'ADMIN';

-- 3. Check org_node distribution
-- SELECT org_node_id, COUNT(*) FROM users WHERE role != 'SYSTEM_ADMIN' GROUP BY org_node_id ORDER BY org_node_id;
