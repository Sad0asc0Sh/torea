/**
 * ⚠️ DEPRECATED ROUTES
 * 
 * This file contains the old catalog management system.
 * It is kept for backward compatibility but will be removed in future versions.
 * 
 * Please use the new catalog manager: /admin/settings/catalog-manager
 * 
 * Migration Guide: docs/migration/CATALOG_MIGRATION.md
 * New Features: docs/CATALOG_MANAGER_USER_GUIDE.md
 * 
 * @deprecated Since version 2.0.0 (2025-01-01)
 * @willBeRemovedIn version 3.0.0
 */

'use strict';

const express = require('express');
const router = express.Router();
const pool = require('../../../config/db');
const {
  getEffectiveCatalogForOrgNode,
  saveOrgNodeItemAccess,
  fetchOrgNodeMode,
} = require('../../../services/catalog.service');
const { getOrgNodes } = require('../../../utils/org');
const {
  toIntOrNull,
  safeMsg,
  renderSettingsPage,
  normalizeStringArray,
  sleep,
} = require('./_shared');

// Log deprecation warning
console.warn('⚠️ [DEPRECATED] Old catalog routes are being used. Please migrate to /admin/settings/catalog-manager');

function redirectWithStatus(status, targetBuilder) {
  return (req, res) => {
    const target = typeof targetBuilder === 'function' ? targetBuilder(req) : targetBuilder;
    const idx = (req.originalUrl || '').indexOf('?');
    const qs = idx >= 0 ? req.originalUrl.slice(idx) : '';
    return res.redirect(status, `${target}${qs}`);
  };
}

// Improved defaults for post-save visibility verification
const DEFAULT_DB_CHECK_DELAY_MS = 100;
const DEFAULT_DB_CHECK_RETRIES = 3;
const DB_CONSISTENCY_CHECK_DELAY_MS = Number(process.env.DB_CONSISTENCY_CHECK_DELAY_MS || DEFAULT_DB_CHECK_DELAY_MS);
const DB_CONSISTENCY_CHECK_RETRIES = Number(process.env.DB_CONSISTENCY_CHECK_RETRIES || DEFAULT_DB_CHECK_RETRIES);

async function listOrgNodesSimple() {
  try {
    const q = await pool.query(
      'SELECT id, title FROM org_nodes ORDER BY COALESCE(level,1), id'
    );
    return q.rows || [];
  } catch (err) {
    console.error('listOrgNodesSimple error:', err);
    return [];
  }
}

async function listActiveCatalogItems() {
  try {
    const q = await pool.query(
      `SELECT key, title, description, parent_key, route_admin, route_user, order_index
       FROM catalog_items
       WHERE is_active = TRUE
       ORDER BY order_index ASC, key ASC`
    );
    return q.rows || [];
  } catch (err) {
    console.error('[settings] listActiveCatalogItems error:', err);
    return [];
  }
}

async function fetchAccessCounts(orgNodeId) {
  if (!orgNodeId) {
    return {
      total_rows: 0,
      visible_true_rows: 0,
      dashboard_true_rows: 0,
      mode: 'USER',
    };
  }

  try {
    const [countsQ, mode] = await Promise.all([
      pool.query(
        `
          SELECT
            COUNT(*) AS total_rows,
            SUM(CASE WHEN visible IS TRUE THEN 1 ELSE 0 END) AS visible_true_rows,
            SUM(CASE WHEN show_on_dashboard IS TRUE THEN 1 ELSE 0 END) AS dashboard_true_rows
          FROM public.org_node_item_access
          WHERE org_node_id = $1
        `,
        [orgNodeId]
      ),
      fetchOrgNodeMode(orgNodeId),
    ]);
    const row = countsQ.rows?.[0] || {};
    const total_rows = Number(row.total_rows || 0);
    const visible_true_rows = Number(row.visible_true_rows || 0);
    const dashboard_true_rows = Number(row.dashboard_true_rows || 0);
    return {
      total_rows,
      visible_true_rows,
      dashboard_true_rows,
      mode: mode || 'USER',
    };
  } catch (err) {
    console.error('fetchAccessCounts error:', err);
    return {
      total_rows: 0,
      visible_true_rows: 0,
      dashboard_true_rows: 0,
      mode: 'USER',
    };
  }
}

router.get('/settings/catalog', redirectWithStatus(301, '/admin/settings/catalog-manager'));

// ADD: Auto-redirect option for migration
router.get('/settings/catalog/migrate', (req, res) => {
  // Set cookie to remember migration preference with security flags
  res.cookie('catalog_migrated', 'true', { 
    maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict'
  });
  return res.redirect('/admin/settings/catalog-manager');
});

router.get('/settings/catalog/org-tree', async (req, res) => {
  try {
    const tree = await getOrgNodes();
    return res.json({ ok: true, tree });
  } catch (err) {
    console.error('GET /admin/settings/catalog/org-tree error:', err);
    return res.status(500).json({ ok: false, error: 'خطا در خواندن درخت سازمانی.' });
  }
});

router.get('/settings/catalog-access', redirectWithStatus(301, '/admin/settings/catalog-manager'));

router.post('/settings/catalog-access', redirectWithStatus(307, '/admin/settings/catalog-manager/apply'));

module.exports = router;
