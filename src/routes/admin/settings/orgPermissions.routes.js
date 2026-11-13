'use strict';

const express = require('express');
const router = express.Router();
const pool = require('../../../config/db');
const { renderSettingsPage } = require('./_shared');
const {
  getEffectiveCatalogForOrgNode,
  saveOrgNodeItemAccess,
  fetchOrgNodeMode,
} = require('../../../services/catalog.service');

/**
 * List all org nodes for dropdown
 */
async function listOrgNodes() {
  try {
    const q = await pool.query(
      'SELECT id, title, level, parent_id FROM org_nodes ORDER BY level ASC, id ASC'
    );
    return q.rows || [];
  } catch (err) {
    console.error('listOrgNodes error:', err);
    return [];
  }
}

/**
 * List all active catalog items
 */
async function listActiveCatalogItems() {
  try {
    const q = await pool.query(
      `SELECT key, title, description, type, parent_key, route_admin, route_user, order_index
       FROM catalog_items
       WHERE is_active = TRUE
       ORDER BY order_index ASC, key ASC`
    );
    return q.rows || [];
  } catch (err) {
    console.error('listActiveCatalogItems error:', err);
    return [];
  }
}

/**
 * Get access data for a specific org node
 */
async function getOrgNodeAccess(orgNodeId) {
  if (!orgNodeId || isNaN(orgNodeId)) return { accessMap: new Map(), mode: 'USER' };
  
  try {
    const [accessQ, mode] = await Promise.all([
      pool.query(
        `SELECT item_key, visible, show_on_dashboard
         FROM org_node_item_access
         WHERE org_node_id = $1`,
        [orgNodeId]
      ),
      fetchOrgNodeMode(orgNodeId),
    ]);
    
    const accessMap = new Map();
    for (const row of accessQ.rows) {
      accessMap.set(row.item_key, {
        visible: row.visible,
        show_on_dashboard: row.show_on_dashboard,
      });
    }
    
    return { accessMap, mode: mode || 'USER' };
  } catch (err) {
    console.error('getOrgNodeAccess error:', err);
    return { accessMap: new Map(), mode: 'USER' };
  }
}

/**
 * GET /admin/settings/org-permissions
 * Display org permissions management UI
 */
router.get('/settings/org-permissions', async (req, res) => {
  try {
    const orgNodeId = req.query.org_node_id ? parseInt(req.query.org_node_id, 10) : null;
    
    const [orgNodes, catalogItems] = await Promise.all([
      listOrgNodes(),
      listActiveCatalogItems(),
    ]);
    
    let selectedOrgNode = null;
    let accessMap = new Map();
    let mode = 'USER';
    
    if (orgNodeId && orgNodes.find(n => n.id === orgNodeId)) {
      selectedOrgNode = orgNodes.find(n => n.id === orgNodeId);
      const accessData = await getOrgNodeAccess(orgNodeId);
      accessMap = accessData.accessMap;
      mode = accessData.mode;
    }
    
    // Enhance items with access info
    const itemsWithAccess = catalogItems.map(item => {
      const access = accessMap.get(item.key) || { visible: false, show_on_dashboard: false };
      return {
        ...item,
        visible: mode === 'ADMIN' ? true : access.visible,
        show_on_dashboard: mode === 'ADMIN' ? true : access.show_on_dashboard,
      };
    });
    
    return renderSettingsPage(req, res, 'admin/settings/org_permissions', {
      orgNodes,
      selectedOrgNodeId: orgNodeId,
      selectedOrgNode,
      items: itemsWithAccess,
      mode,
      success: req.query.ok || null,
      error: req.query.err || null,
    });
  } catch (err) {
    console.error('GET /admin/settings/org-permissions error:', err);
    return res.status(500).send('خطا در بارگذاری صفحه');
  }
});

/**
 * POST /admin/settings/org-permissions
 * Save org node permissions
 */
router.post('/settings/org-permissions', async (req, res) => {
  try {
    const orgNodeId = parseInt(req.body.org_node_id, 10);
    const mode = req.body.mode || 'USER';
    
    if (!orgNodeId) {
      return res.redirect('/admin/settings/org-permissions?err=' + encodeURIComponent('لطفاً سمت سازمانی را انتخاب کنید'));
    }
    
    // Parse arrays from form data
    const visibleKeys = Array.isArray(req.body.visible) ? req.body.visible : (req.body.visible ? [req.body.visible] : []);
    const dashboardKeys = Array.isArray(req.body.dashboard) ? req.body.dashboard : (req.body.dashboard ? [req.body.dashboard] : []);
    
    // Save permissions
    await saveOrgNodeItemAccess(orgNodeId, {
      visibleKeys,
      dashboardKeys,
      mode,
    });
    
    return res.redirect(`/admin/settings/org-permissions?org_node_id=${orgNodeId}&ok=` + encodeURIComponent('دسترسی‌ها با موفقیت ذخیره شد'));
  } catch (err) {
    console.error('POST /admin/settings/org-permissions error:', err);
    const orgNodeId = req.body.org_node_id || '';
    return res.redirect(`/admin/settings/org-permissions${orgNodeId ? '?org_node_id=' + orgNodeId + '&' : '?'}err=` + encodeURIComponent('خطا در ذخیره‌سازی'));
  }
});

/**
 * POST /admin/settings/org-permissions/copy
 * Copy permissions from another org node
 */
router.post('/settings/org-permissions/copy', async (req, res) => {
  try {
    const targetOrgNodeId = parseInt(req.body.target_org_node_id, 10);
    const sourceOrgNodeId = parseInt(req.body.source_org_node_id, 10);
    
    if (!targetOrgNodeId || !sourceOrgNodeId) {
      return res.redirect('/admin/settings/org-permissions?err=' + encodeURIComponent('لطفاً سمت مبدأ و مقصد را انتخاب کنید'));
    }
    
    // Get source permissions
    const sourceAccess = await getOrgNodeAccess(sourceOrgNodeId);
    
    // Build arrays
    const visibleKeys = [];
    const dashboardKeys = [];
    
    for (const [key, access] of sourceAccess.accessMap.entries()) {
      if (access.visible) visibleKeys.push(key);
      if (access.show_on_dashboard) dashboardKeys.push(key);
    }
    
    // Save to target
    await saveOrgNodeItemAccess(targetOrgNodeId, {
      visibleKeys,
      dashboardKeys,
      mode: sourceAccess.mode,
    });
    
    return res.redirect(`/admin/settings/org-permissions?org_node_id=${targetOrgNodeId}&ok=` + encodeURIComponent('دسترسی‌ها از سمت دیگر کپی شد'));
  } catch (err) {
    console.error('POST /admin/settings/org-permissions/copy error:', err);
    const targetOrgNodeId = req.body.target_org_node_id || '';
    return res.redirect(`/admin/settings/org-permissions${targetOrgNodeId ? '?org_node_id=' + targetOrgNodeId + '&' : '?'}err=` + encodeURIComponent('خطا در کپی دسترسی‌ها'));
  }
});

module.exports = router;
