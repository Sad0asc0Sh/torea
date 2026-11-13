'use strict';

const express = require('express');
const router = express.Router();
const pool = require('../../../config/db');
const { safeMsg } = require('./_shared');
const { VALID_CATALOG_TYPES, DEFAULT_CATALOG_TYPE } = require('../../../config/catalogConstants');

// Lazy load discovery service to avoid database connection issues in tests
let discoveryService = null;
function getDiscoveryService() {
  if (!discoveryService) {
    discoveryService = require('../../../services/catalogDiscovery.service');
  }
  return discoveryService;
}

/**
 * Parse array from form data
 * Handles: array, string, undefined
 */
function parseArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') return [value];
  return [];
}

/**
 * Field whitelist for quick-edit to prevent SQL injection
 */
const ALLOWED_FIELDS = {
  title: 'title',
  description: 'description',
  icon: 'icon',
  order_index: 'order_index',
  type: 'type',
  parent_key: 'parent_key'
};

/**
 * GET /admin/settings/catalog-manager
 * Display catalog manager UI
 * - Call discoverAllCatalogItems()
 * - Pass data to view
 * - Handle query params (ok, err for messages)
 * - Default view: 'tree' (can be changed via query param)
 */
router.get('/settings/catalog-manager', async (req, res) => {
  try {
    const { discoverAllCatalogItems } = getDiscoveryService();
    const result = await discoverAllCatalogItems();
    
    return res.render('admin/settings/catalog_manager', {
      user: req.session?.user || null,
      data: result,
      view: req.query.view || 'tree',
      success: safeMsg(req.query.ok) || null,
      error: safeMsg(req.query.err) || null,
    });
  } catch (err) {
    console.error('[Catalog Manager] GET error:', err);
    return res.status(500).render('admin/settings/catalog_manager', {
      user: req.session?.user || null,
      data: null,
      view: 'tree',
      success: null,
      error: 'خطا در بارگذاری داده‌ها: ' + err.message,
    });
  }
});

/**
 * POST /admin/settings/catalog-manager/apply
 * Apply bulk changes (selections + edits)
 * 
 * Request body: 
 * - selected_keys: array of keys to activate
 * - edits: JSON string of edits { key: { field: value } }
 * - items_data: JSON string of all items
 * 
 * Process:
 * 1. Parse inputs
 * 2. BEGIN transaction
 * 3. For each selected key:
 *    - Get item data
 *    - Apply custom edits
 *    - UPSERT to database (INSERT if new, UPDATE if exists)
 * 4. For unselected keys:
 *    - Set is_active = FALSE
 * 5. COMMIT transaction
 * 6. Redirect with success message
 * 
 * Error handling:
 * - ROLLBACK on any error
 * - Collect per-item errors
 * - Show summary in redirect message
 */
router.post('/settings/catalog-manager/apply', async (req, res) => {
  const client = await pool.connect();
  
  try {
    // 🆕 Enhanced logging for debugging
    console.log('[Catalog Manager] POST /apply received');
    console.log('[Catalog Manager] Content-Type:', req.get('Content-Type'));
    console.log('[Catalog Manager] User-Agent:', req.get('User-Agent'));
    console.log('[Catalog Manager] Body keys:', Object.keys(req.body));
    console.log('[Catalog Manager] selected_keys (raw):', req.body.selected_keys);
    console.log('[Catalog Manager] selected_keys type:', typeof req.body.selected_keys);
    console.log('[Catalog Manager] selected_keys isArray:', Array.isArray(req.body.selected_keys));
    
    await client.query('BEGIN');
    
    const selectedKeys = parseArray(req.body.selected_keys);
    
    console.log('[Catalog Manager] Parsed selected_keys:', selectedKeys);
    console.log('[Catalog Manager] Selected count:', selectedKeys.length);
    
    // Parse JSON with error handling
    let edits = {};
    let allItemsData = [];
    
    try {
      edits = JSON.parse(req.body.edits || '{}');
    } catch (parseErr) {
      throw new Error('فرمت edits نامعتبر است');
    }
    
    try {
      allItemsData = JSON.parse(req.body.items_data || '[]');
    } catch (parseErr) {
      throw new Error('فرمت items_data نامعتبر است');
    }
    
    const stats = {
      inserted: 0,
      updated: 0,
      skipped: 0,
      deactivated: 0,
      errors: [],
    };
    
    // Process selected items
    for (const key of selectedKeys) {
      const item = allItemsData.find(i => i.key === key);
      if (!item) continue;
      
      const edit = edits[key] || {};
      
      const data = {
        key,
        title: edit.title || item.display_title || item.title,
        description: edit.description || item.description || null,
        type: edit.type || item.type || DEFAULT_CATALOG_TYPE,
        route_admin: item.route_admin || null,
        route_user: item.route_user || item.route_admin || null,
        parent_key: edit.parent_key !== undefined ? edit.parent_key : (item.parent_key || item.suggested_parent_key || null),
        order_index: parseInt(edit.order_index ?? item.order_index ?? item.db_order_index ?? 0, 10),
        icon: edit.icon || item.display_icon || item.icon || null,
        is_active: true,
      };
      
      // Validation: Ensure required fields are present
      if (!data.key || !data.title || !data.type) {
        console.error(`Skipping item with missing required fields: key=${data.key}, title=${data.title}, type=${data.type}`);
        stats.skipped++;
        continue;
      }
      
      // Validation: Ensure type is valid
      if (!VALID_CATALOG_TYPES.includes(data.type)) {
        console.error(`Skipping item with invalid type: key=${data.key}, type=${data.type}`);
        stats.skipped++;
        continue;
      }
      
      try {
        const existsResult = await client.query(
          'SELECT key FROM catalog_items WHERE key = $1',
          [key]
        );
        
        if (existsResult.rows.length > 0) {
          // Update
          await client.query(
            `UPDATE catalog_items 
             SET title = $2, description = $3, type = $4,
                 route_admin = $5, route_user = $6,
                 parent_key = $7, order_index = $8, icon = $9,
                 is_active = $10, updated_at = NOW()
             WHERE key = $1`,
            [data.key, data.title, data.description, data.type,
             data.route_admin, data.route_user, data.parent_key,
             data.order_index, data.icon, data.is_active]
          );
          stats.updated++;
        } else {
          // Insert
          await client.query(
            `INSERT INTO catalog_items 
             (key, title, description, type, route_admin, route_user,
              parent_key, order_index, icon, is_active)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [data.key, data.title, data.description, data.type,
             data.route_admin, data.route_user, data.parent_key,
             data.order_index, data.icon, data.is_active]
          );
          stats.inserted++;
        }
      } catch (itemErr) {
        stats.errors.push({ key, error: itemErr.message });
      }
    }
    
    // Deactivate unselected
    const allKeys = allItemsData.map(i => i.key);
    const unselectedKeys = allKeys.filter(k => !selectedKeys.includes(k));
    
    if (unselectedKeys.length > 0) {
      const deactivateResult = await client.query(
        `UPDATE catalog_items 
         SET is_active = FALSE, updated_at = NOW()
         WHERE key = ANY($1::text[]) AND is_active = TRUE`,
        [unselectedKeys]
      );
      stats.deactivated = deactivateResult.rowCount || 0;
    }
    
    await client.query('COMMIT');
    
    let message = `✅ موفق: ${stats.inserted} جدید، ${stats.updated} بروزرسانی`;
    if (stats.deactivated > 0) {
      message += `، ${stats.deactivated} غیرفعال`;
    }
    if (stats.errors.length > 0) {
      message += ` | ⚠️ ${stats.errors.length} خطا`;
    }
    
    return res.redirect(`/admin/settings/catalog-manager?ok=${encodeURIComponent(message)}`);
    
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Catalog Manager] POST apply error:', err);
    return res.redirect(`/admin/settings/catalog-manager?err=${encodeURIComponent('خطا: ' + err.message)}`);
  } finally {
    client.release();
  }
});

/**
 * POST /admin/settings/catalog-manager/quick-edit
 * Quick edit single field (AJAX endpoint)
 * 
 * Request body (JSON):
 * - key: string (item key)
 * - field: string (field name)
 * - value: any (new value)
 * 
 * Response (JSON):
 * - ok: boolean
 * - error: string (if failed)
 * 
 * Allowed fields: title, description, icon, order_index, type, parent_key
 */
router.post('/settings/catalog-manager/quick-edit', async (req, res) => {
  try {
    const { key, field, value } = req.body;
    
    // Validation
    if (!key || !field) {
      return res.status(400).json({ 
        ok: false, 
        error: 'پارامترهای key و field الزامی هستند' 
      });
    }
    
    // Use whitelist mapping to prevent SQL injection
    const columnName = ALLOWED_FIELDS[field];
    if (!columnName) {
      return res.status(400).json({ 
        ok: false, 
        error: `فیلد ${field} قابل ویرایش نیست` 
      });
    }
    
    // Safe parameterized query using whitelist-validated column name
    const query = `UPDATE catalog_items SET ${columnName} = $1, updated_at = NOW() WHERE key = $2`;
    await pool.query(query, [value, key]);
    
    return res.json({ ok: true });
    
  } catch (err) {
    console.error('[Catalog Manager] Quick edit error:', err);
    return res.status(500).json({ 
      ok: false, 
      error: err.message 
    });
  }
});

/**
 * GET /admin/settings/catalog-manager/api/discover
 * Force re-discovery (clear cache + discover)
 * 
 * Response (JSON):
 * - ok: boolean
 * - stats: object
 * - timestamp: string
 */
router.get('/settings/catalog-manager/api/discover', async (req, res) => {
  try {
    const { discoverAllCatalogItems, clearCache } = getDiscoveryService();
    
    // Clear cache to force fresh discovery
    clearCache();
    
    const result = await discoverAllCatalogItems();
    
    return res.json({
      ok: true,
      stats: result.stats,
      timestamp: result.timestamp,
    });
    
  } catch (err) {
    console.error('[Catalog Manager] API discover error:', err);
    return res.status(500).json({
      ok: false,
      error: err.message,
    });
  }
});

/**
 * GET /admin/settings/catalog-manager/api/stats
 * Get current stats (uses cache if available)
 * 
 * Response (JSON):
 * - ok: boolean
 * - stats: object
 */
router.get('/settings/catalog-manager/api/stats', async (req, res) => {
  try {
    const { discoverAllCatalogItems } = getDiscoveryService();
    const result = await discoverAllCatalogItems();
    
    return res.json({
      ok: true,
      stats: result.stats,
    });
    
  } catch (err) {
    console.error('[Catalog Manager] API stats error:', err);
    return res.status(500).json({
      ok: false,
      error: err.message,
    });
  }
});

/**
 * POST /admin/settings/catalog-manager/cache/clear
 * Clear discovery cache
 */
router.post('/settings/catalog-manager/cache/clear', async (req, res) => {
  try {
    const { clearCache } = getDiscoveryService();
    clearCache();
    
    return res.json({ 
      ok: true, 
      message: 'Cache cleared successfully' 
    });
  } catch (err) {
    return res.status(500).json({ 
      ok: false, 
      error: err.message 
    });
  }
});

/**
 * GET /admin/settings/catalog-manager/health
 * Health check endpoint
 */
router.get('/settings/catalog-manager/health', async (req, res) => {
  try {
    const { discoverAllCatalogItems } = getDiscoveryService();
    const start = Date.now();
    const result = await discoverAllCatalogItems();
    const duration = Date.now() - start;
    
    return res.json({
      ok: true,
      performance: {
        discoveryTime: duration,
        itemCount: result.stats.total,
        status: duration < 500 ? 'good' : 'slow',
      },
      cache: {
        enabled: process.env.CATALOG_DISCOVERY_CACHE_ENABLED === 'true',
      },
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err.message,
    });
  }
});

module.exports = router;
