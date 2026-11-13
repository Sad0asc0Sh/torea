-- ===================================================================
-- CATALOG DATABASE AUDIT AND FIX SQL QUERIES
-- ===================================================================
-- Repository: smkhadivpoor/Toinfinity
-- Purpose: Manual SQL queries for auditing and fixing catalog access
-- 
-- IMPORTANT: These queries are safe and idempotent
-- All INSERT queries use ON CONFLICT DO NOTHING
-- ===================================================================

-- ===================================================================
-- SECTION A: AUDIT QUERIES (READ-ONLY)
-- ===================================================================

-- A1. List all catalog items
SELECT key, title, type, parent_key, route_admin, route_user, is_active, order_index
FROM catalog_items
ORDER BY order_index, key;

-- A2. Check org_node catalog modes
SELECT on.id, on.name, oncm.mode
FROM org_nodes orgn
LEFT JOIN org_node_catalog_mode oncm ON oncm.org_node_id = on.id
ORDER BY on.id;

-- A3. Count granted items per org_node
SELECT org_node_id, COUNT(*) as granted_items,
       SUM(CASE WHEN visible = true THEN 1 ELSE 0 END) as visible_items
FROM org_node_item_access
GROUP BY org_node_id
ORDER BY org_node_id;

-- A4. Find USER-mode org_nodes without any visible grants (CRITICAL)
SELECT on.id, on.name, COALESCE(oncm.mode, 'USER (default)') as mode
FROM org_nodes orgn
LEFT JOIN org_node_catalog_mode oncm ON oncm.org_node_id = on.id
WHERE (oncm.mode = 'USER' OR oncm.mode IS NULL)
  AND NOT EXISTS (
    SELECT 1 FROM org_node_item_access onia
    WHERE onia.org_node_id = on.id AND onia.visible = true
  )
ORDER BY on.id;

-- A5. Find org_nodes without catalog mode
SELECT on.id, on.name
FROM org_nodes orgn
WHERE id NOT IN (SELECT org_node_id FROM org_node_catalog_mode)
ORDER BY on.id;

-- A6. Check catalog items without routes (pages/tools should have routes)
SELECT key, type, route_admin, route_user
FROM catalog_items
WHERE (route_admin IS NULL OR route_admin = '')
  AND (route_user IS NULL OR route_user = '')
  AND type IN ('page', 'tool', 'report', 'setting')
ORDER BY key;

-- A7. List sample grants for specific org_node (replace 1 with actual ID)
SELECT onia.item_key, onia.visible, onia.show_on_dashboard, ci.title, ci.type, ci.route_admin
FROM org_node_item_access onia
JOIN catalog_items ci ON ci.key = onia.item_key
WHERE onia.org_node_id = 1
ORDER BY ci.order_index, onia.item_key;

-- A8. Count catalog items by type
SELECT type, COUNT(*) as count, SUM(CASE WHEN is_active THEN 1 ELSE 0 END) as active_count
FROM catalog_items
GROUP BY type
ORDER BY type;

-- A9. Summary statistics
SELECT
  (SELECT COUNT(*) FROM catalog_items WHERE is_active = true) as active_catalog_items,
  (SELECT COUNT(*) FROM org_nodes) as total_org_nodes,
  (SELECT COUNT(*) FROM org_node_catalog_mode) as org_nodes_with_mode,
  (SELECT COUNT(*) FROM org_node_catalog_mode WHERE mode = 'USER') as user_mode_count,
  (SELECT COUNT(*) FROM org_node_catalog_mode WHERE mode = 'ADMIN') as admin_mode_count,
  (SELECT COUNT(DISTINCT org_node_id) FROM org_node_item_access) as org_nodes_with_grants,
  (SELECT COUNT(*) FROM org_node_item_access WHERE visible = true) as total_visible_grants;

-- ===================================================================
-- SECTION B: FIX QUERIES (IDEMPOTENT - SAFE TO RUN MULTIPLE TIMES)
-- ===================================================================

-- B1. Ensure all org_nodes have catalog mode (default: USER)
-- SAFE: Uses ON CONFLICT DO NOTHING
INSERT INTO org_node_catalog_mode (org_node_id, mode)
SELECT id, 'USER'
FROM org_nodes
WHERE id NOT IN (SELECT org_node_id FROM org_node_catalog_mode)
ON CONFLICT (org_node_id) DO NOTHING;

-- B2. Grant full catalog access to all USER-mode org_nodes (for testing)
-- SAFE: Uses ON CONFLICT DO NOTHING
-- WARNING: This grants ALL active items to ALL USER-mode org_nodes
-- Consider limiting this to specific org_nodes for production
INSERT INTO org_node_item_access (org_node_id, item_key, visible, show_on_dashboard)
SELECT oncm.org_node_id, ci.key, true, false
FROM org_node_catalog_mode oncm
CROSS JOIN catalog_items ci
WHERE oncm.mode = 'USER'
  AND ci.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM org_node_item_access onia
    WHERE onia.org_node_id = oncm.org_node_id AND onia.item_key = ci.key
  )
ON CONFLICT (org_node_id, item_key) DO NOTHING;

-- B3. Grant access to specific org_node (replace 1 with actual ID)
-- SAFE: Uses ON CONFLICT DO NOTHING
INSERT INTO org_node_item_access (org_node_id, item_key, visible, show_on_dashboard)
SELECT 1, key, true, false
FROM catalog_items
WHERE is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM org_node_item_access onia
    WHERE onia.org_node_id = 1 AND onia.item_key = catalog_items.key
  )
ON CONFLICT (org_node_id, item_key) DO NOTHING;

-- B4. Set specific org_node to ADMIN mode (replace 1 with actual ID)
-- SAFE: Uses ON CONFLICT DO UPDATE
INSERT INTO org_node_catalog_mode (org_node_id, mode)
VALUES (1, 'ADMIN')
ON CONFLICT (org_node_id)
DO UPDATE SET mode = EXCLUDED.mode, updated_at = NOW();

-- B5. Set specific org_node to USER mode (replace 1 with actual ID)
-- SAFE: Uses ON CONFLICT DO UPDATE
INSERT INTO org_node_catalog_mode (org_node_id, mode)
VALUES (1, 'USER')
ON CONFLICT (org_node_id)
DO UPDATE SET mode = EXCLUDED.mode, updated_at = NOW();

-- ===================================================================
-- SECTION C: VERIFICATION QUERIES (POST-FIX)
-- ===================================================================

-- C1. Verify all org_nodes have mode
SELECT COUNT(*) as org_nodes_without_mode
FROM org_nodes
WHERE id NOT IN (SELECT org_node_id FROM org_node_catalog_mode);
-- Expected: 0

-- C2. Verify USER-mode org_nodes have grants
SELECT COUNT(*) as user_mode_without_grants
FROM org_nodes orgn
LEFT JOIN org_node_catalog_mode oncm ON oncm.org_node_id = on.id
WHERE (oncm.mode = 'USER' OR oncm.mode IS NULL)
  AND NOT EXISTS (
    SELECT 1 FROM org_node_item_access onia
    WHERE onia.org_node_id = on.id AND onia.visible = true
  );
-- Expected: 0

-- C3. Check grant distribution
SELECT
  oncm.mode,
  COUNT(DISTINCT oncm.org_node_id) as org_count,
  AVG(grant_counts.grant_count) as avg_grants
FROM org_node_catalog_mode oncm
LEFT JOIN (
  SELECT org_node_id, COUNT(*) as grant_count
  FROM org_node_item_access
  WHERE visible = true
  GROUP BY org_node_id
) grant_counts ON grant_counts.org_node_id = oncm.org_node_id
GROUP BY oncm.mode;

-- ===================================================================
-- SECTION D: DANGEROUS QUERIES (USE WITH CAUTION)
-- ===================================================================

-- D1. Remove all grants for specific org_node (replace 1 with actual ID)
-- WARNING: This will REVOKE all access for this org_node
-- ONLY use if you need to reset and re-grant
-- DELETE FROM org_node_item_access WHERE org_node_id = 1;

-- D2. Remove all USER-mode grants (for reset/testing)
-- WARNING: This will affect ALL USER-mode org_nodes
-- ONLY use in development/testing environment
-- DELETE FROM org_node_item_access
-- WHERE org_node_id IN (
--   SELECT org_node_id FROM org_node_catalog_mode WHERE mode = 'USER'
-- );

-- D3. Mark all catalog items as inactive (emergency disable)
-- WARNING: This disables entire catalog
-- ONLY use in emergency situation
-- UPDATE catalog_items SET is_active = FALSE;

-- ===================================================================
-- SECTION E: USEFUL ANALYSIS QUERIES
-- ===================================================================

-- E1. Find orphaned grants (items not in catalog)
SELECT DISTINCT onia.item_key
FROM org_node_item_access onia
WHERE NOT EXISTS (
  SELECT 1 FROM catalog_items ci WHERE ci.key = onia.item_key
);

-- E2. Find items with no grants to any org_node
SELECT ci.key, ci.title, ci.type
FROM catalog_items ci
WHERE ci.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM org_node_item_access onia
    WHERE onia.item_key = ci.key AND onia.visible = true
  )
ORDER BY ci.order_index, ci.key;

-- E3. Most/least granted items
SELECT ci.key, ci.title, COUNT(onia.org_node_id) as grant_count
FROM catalog_items ci
LEFT JOIN org_node_item_access onia ON onia.item_key = ci.key AND onia.visible = true
WHERE ci.is_active = true
GROUP BY ci.key, ci.title
ORDER BY grant_count DESC, ci.key;

-- E4. Hierarchical view of catalog
WITH RECURSIVE catalog_tree AS (
  -- Root items
  SELECT key, title, type, parent_key, route_admin, 0 as level, key as path
  FROM catalog_items
  WHERE parent_key IS NULL AND is_active = true
  
  UNION ALL
  
  -- Child items
  SELECT ci.key, ci.title, ci.type, ci.parent_key, ci.route_admin,
         ct.level + 1, ct.path || ' > ' || ci.key
  FROM catalog_items ci
  JOIN catalog_tree ct ON ci.parent_key = ct.key
  WHERE ci.is_active = true
)
SELECT REPEAT('  ', level) || title as tree_title, key, type, route_admin
FROM catalog_tree
ORDER BY path;

-- ===================================================================
-- END OF SQL QUERIES
-- ===================================================================
