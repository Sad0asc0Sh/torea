'use strict';

const express = require('express');
const { Pool } = require('pg');
const { requireLogin } = require('../middlewares/auth');
const { enforceRole, enforceStatus } = require('../middlewares/guards');

const router = express.Router();

/**
 * Admin Routes
 * - Uses a single shared PG pool (global.__briaPool)
 * - Hierarchy:
 *   1) /admin/definitions/hierarchy          => Define org roles (org_nodes)
 *   2) /admin/definitions/hierarchy/arrange  => Arrange parent-child edges (org_node_edges) with cycle protection
 */

// -----------------------------
// DB Pool (single shared)
// -----------------------------
const connectionString = process.env.DATABASE_URL;
global.__briaPool = global.__briaPool || new Pool({ connectionString });
const pool = global.__briaPool;

// For backward-compat with older code that expects __briaHierarchyPool
global.__briaHierarchyPool = global.__briaHierarchyPool || pool;
const hierarchyPool = global.__briaHierarchyPool;

// -----------------------------
// Helpers
// -----------------------------
function getSessionUser(req) {
  return (req && req.session && req.session.user) ? req.session.user : null;
}

function toIntOrNull(v) {
  const s = (v === undefined || v === null) ? '' : String(v).trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function safeMsg(x) {
  if (!x) return null;
  const s = String(x);
  return s.length > 2000 ? s.slice(0, 2000) : s;
}

// NOTE: intentionally NO auto-seed here.
// We allow org_nodes to be empty; admin defines nodes manually.
async function ensureRootAdminNode() {
  return true;
}

router.use(
  requireLogin,
  enforceRole(['ADMIN', 'SUPER_ADMIN', 'SYSTEM_ADMIN']),
  enforceStatus
);

async function fetchNodes() {
  const sql =
    "SELECT n.id, n.title, n.parent_id, COALESCE(n.level,1) AS level, " +
    "       COALESCE(n.branch,'ORG') AS branch, " +
    "       p.title AS parent_title " +
    "FROM org_nodes n " +
    "LEFT JOIN org_nodes p ON p.id = n.parent_id " +
    "WHERE COALESCE(n.branch,'ORG') <> 'SYSTEM' " +
    "ORDER BY COALESCE(n.level,1), n.id";
  const q = await hierarchyPool.query(sql);
  return q.rows || [];
}

function renderHierarchy(res, user, nodes, editNode, error, message) {
  // Provide extra aliases to avoid EJS mismatches from older templates
  return res.render('admin_hierarchy', {
    user: user || null,
    nodes: nodes || [],
    rows: nodes || [],
    options: nodes || [],
    editNode: editNode || null,
    error: error || null,
    message: message || null,
  });
}

// -----------------------------
// Basic admin pages
// -----------------------------
router.get('/dashboard', (req, res) => {
  res.render('admin_dashboard', { user: getSessionUser(req) });
});

router.get('/definitions', (req, res) => {
  res.render('definitions/index', {
    user: getSessionUser(req),
    warn: safeMsg(req.query && req.query.warn),
  });
});

// -----------------------------
// Approvals
// -----------------------------
router.get('/approvals', async (req, res) => {
  const user = getSessionUser(req);
  try {
    const sql =
      "SELECT " +
      "  u.id, " +
      "  CONCAT_WS(' ', u.first_name, u.last_name) AS full_name, " +
      "  u.username, " +
      "  u.status, " +
      "  u.org_node_id, " +
      "  u.manager_id, " +
      "  o.title AS org_title, " +
      "  CONCAT_WS(' ', m.first_name, m.last_name) AS manager_name " +
      "FROM users u " +
      "LEFT JOIN org_nodes o ON o.id = u.org_node_id " +
      "LEFT JOIN users m ON m.id = u.manager_id " +
      "WHERE u.status = 'pending_manager' " +
      "ORDER BY u.id DESC";

    const pending = await pool.query(sql);

    return res.render('admin_approvals', {
      user,
      items: pending.rows || [],
      error: null,
      message: null,
    });
  } catch (e) {
    console.error('GET /admin/approvals error:', e);
    return res.render('admin_approvals', {
      user,
      items: [],
      error: 'خطا در خواندن لیست کاربران در انتظار تأیید.',
      message: null,
    });
  }
});

router.post('/approvals/action', async (req, res) => {
  const id = toIntOrNull(req.body && req.body.id);
  const action = (req.body && req.body.action) ? String(req.body.action) : '';

  if (!id || (action !== 'approve' && action !== 'reject')) {
    return res.redirect('/admin/approvals');
  }

  const approvedBy = (req.session && req.session.user) ? req.session.user.id : null;

  try {
    if (action === 'approve') {
      await pool.query(
        'UPDATE users SET status=$1, active=$2, approved_by=$3 WHERE id=$4',
        ['active', true, approvedBy, id]
      );
    } else {
      await pool.query(
        'UPDATE users SET status=$1, active=$2, approved_by=$3 WHERE id=$4',
        ['rejected', false, null, id]
      );
    }
  } catch (e) {
    console.error('POST /admin/approvals/action error:', e);
  }

  return res.redirect('/admin/approvals');
});

// -----------------------------
// Reports
// -----------------------------
router.get('/reports', async (req, res) => {
  const user = getSessionUser(req);
  try {
    const br = await pool.query('SELECT COUNT(*)::int AS c FROM brands');
    const p = await pool.query('SELECT COUNT(*)::int AS c FROM products');

    return res.render('admin_reports', {
      user,
      count_brands: (br.rows[0] && br.rows[0].c) ? br.rows[0].c : 0,
      count_products: (p.rows[0] && p.rows[0].c) ? p.rows[0].c : 0,
    });
  } catch (e) {
    console.error('GET /admin/reports error:', e);
    return res.render('admin_reports', {
      user,
      count_brands: 0,
      count_products: 0,
    });
  }
});

// ============================================================
// Hierarchy (org_nodes) - define roles/titles
// ============================================================
router.get('/definitions/hierarchy', async (req, res) => {
  const user = getSessionUser(req);
  const editId = toIntOrNull(req.query && (req.query.edit_id || req.query.edit));
  const error = safeMsg(req.query && req.query.err);
  const message = safeMsg(req.query && req.query.ok);

  try {
    await ensureRootAdminNode();
    const nodes = await fetchNodes();

    const editNode = editId ? nodes.find((n) => Number(n.id) === Number(editId)) : null;
    return renderHierarchy(res, user, nodes, editNode, error, message);
  } catch (e) {
    console.error('hierarchy GET error:', e);
    return renderHierarchy(
      res,
      user,
      [],
      null,
      error || (e && e.message ? e.message : 'خطا در بارگذاری سلسله‌مراتب.'),
      message
    );
  }
});

router.post('/definitions/hierarchy', async (req, res) => {
  const user = getSessionUser(req);

  const title = (req.body && req.body.title) ? String(req.body.title).trim() : '';
  try {
    await ensureRootAdminNode();

    if (!title) {
      const nodes = await fetchNodes().catch(() => []);
      return renderHierarchy(res, user, nodes, null, 'عنوان را وارد کنید.', null);
    }

    // Only insert title; parent_id stays NULL until set via /arrange route
    // DB triggers will handle level calculation when parent_id is set
    await hierarchyPool.query(
      'INSERT INTO org_nodes(title, parent_id) VALUES ($1, NULL)',
      [title]
    );

    return res.redirect('/admin/definitions/hierarchy?ok=' + encodeURIComponent('با موفقیت ثبت شد.'));
  } catch (e) {
    console.error('hierarchy POST error:', e);

    // Friendly duplicate handling
    const msg =
      (e && String(e.code) === '23505')
        ? 'این سمت قبلاً ثبت شده است.'
        : 'خطا در ذخیره‌سازی. دوباره تلاش کنید.';

    return res.redirect('/admin/definitions/hierarchy?err=' + encodeURIComponent(msg));
  }
});

router.post('/definitions/hierarchy/update', async (req, res) => {
  const user = getSessionUser(req);

  const id = toIntOrNull(req.body && req.body.id);
  const title = (req.body && req.body.title) ? String(req.body.title).trim() : '';

  if (!id) return res.redirect('/admin/definitions/hierarchy');

  try {
    await ensureRootAdminNode();

    if (!title) {
      const nodes = await fetchNodes().catch(() => []);
      return renderHierarchy(res, user, nodes, { id, title }, 'عنوان را وارد کنید.', null);
    }

    // Only update title; parent_id and level are managed via /arrange route
    await hierarchyPool.query(
      'UPDATE org_nodes SET title=$1 WHERE id=$2',
      [title, id]
    );

    return res.redirect('/admin/definitions/hierarchy?ok=' + encodeURIComponent('ویرایش با موفقیت انجام شد.'));
  } catch (e) {
    console.error('hierarchy UPDATE error:', e);
    const msg =
      (e && String(e.code) === '23505')
        ? 'این سمت قبلاً ثبت شده است.'
        : 'خطا در ویرایش. دوباره تلاش کنید.';
    return res.redirect('/admin/definitions/hierarchy?err=' + encodeURIComponent(msg));
  }
});

router.post('/definitions/hierarchy/delete', async (req, res) => {
  const id = toIntOrNull(req.body && req.body.id);
  if (!id) return res.redirect('/admin/definitions/hierarchy');

  try {
    await ensureRootAdminNode();

    // Protect against deleting nodes that are referenced
    const usersRef = await hierarchyPool.query('SELECT COUNT(*)::int AS c FROM users WHERE org_node_id=$1', [id]);
    const confRef = await hierarchyPool.query('SELECT COUNT(*)::int AS c FROM user_confirmations WHERE confirmed_by_node_id=$1', [id]).catch(() => ({ rows: [{ c: 0 }] }));

    const refUsers = (usersRef.rows[0] && usersRef.rows[0].c) ? usersRef.rows[0].c : 0;
    const refConf = (confRef.rows[0] && confRef.rows[0].c) ? confRef.rows[0].c : 0;

    if (refUsers > 0 || refConf > 0) {
      const msg = 'این سمت در سیستم استفاده شده و قابل حذف نیست. (کاربران: ' + refUsers + ', تأییدها: ' + refConf + ')';
      return res.redirect('/admin/definitions/hierarchy?err=' + encodeURIComponent(msg));
    }

    // If has children in org_nodes, do not delete
    const children = await hierarchyPool.query('SELECT COUNT(*)::int AS c FROM org_nodes WHERE parent_id=$1', [id]);
    const ch = (children.rows[0] && children.rows[0].c) ? children.rows[0].c : 0;
    if (ch > 0) {
      return res.redirect('/admin/definitions/hierarchy?err=' + encodeURIComponent('این لایه زیرمجموعه دارد و قابل حذف نیست.'));
    }

    // Delete from org_nodes; edges will cascade automatically via FK constraints
    await hierarchyPool.query('DELETE FROM org_nodes WHERE id=$1', [id]);

    return res.redirect('/admin/definitions/hierarchy?ok=' + encodeURIComponent('حذف با موفقیت انجام شد.'));
  } catch (e) {
    console.error('hierarchy DELETE error:', e);
    // If FK fails anyway, show a clearer message
    const msg =
      (e && String(e.code) === '23503')
        ? 'این سمت در سیستم استفاده شده و قابل حذف نیست.'
        : 'خطا در حذف. دوباره تلاش کنید.';
    return res.redirect('/admin/definitions/hierarchy?err=' + encodeURIComponent(msg));
  }
});

// ============================================================
// Hierarchy Arrange (org_node_edges) - set parent/child edges
// ============================================================
router.get('/definitions/hierarchy/arrange', async (req, res) => {
  const user = getSessionUser(req);
  try {
    await ensureRootAdminNode();

    const nodesQ = await hierarchyPool.query(
      "SELECT id, title FROM org_nodes WHERE COALESCE(branch,'ORG') <> 'SYSTEM' ORDER BY COALESCE(level,1), id"
    );

    // If table doesn't exist yet, show empty edges
    let edgesRows = [];
    try {
      const edgesSql =
        "SELECT e.child_id, e.parent_id, " +
        "       c.title AS child_title, " +
        "       p.title AS parent_title " +
        "FROM org_node_edges e " +
        "JOIN org_nodes c ON c.id = e.child_id " +
        "LEFT JOIN org_nodes p ON p.id = e.parent_id " +
        "ORDER BY c.id";
      const edgesQ = await hierarchyPool.query(edgesSql);
      edgesRows = edgesQ.rows || [];
    } catch (e) {
      console.error('hierarchy arrange edges read error:', e);
      edgesRows = [];
    }

    return res.render('admin_hierarchy_arrange', {
      user,
      nodes: nodesQ.rows || [],
      edges: edgesRows,
      error: safeMsg(req.query && req.query.err),
      message: safeMsg(req.query && req.query.ok),
    });
  } catch (e) {
    console.error('hierarchy arrange GET error:', e);
    return res.status(200).send('خطا در بارگذاری صفحه چیدمان سلسله‌مراتب');
  }
});

router.post('/definitions/hierarchy/link', async (req, res) => {
  const parentId = toIntOrNull(req.body && req.body.parent_id);
  const childId = toIntOrNull(req.body && req.body.child_id);

  try {
    await ensureRootAdminNode();

    if (!parentId || !childId) {
      return res.redirect('/admin/definitions/hierarchy/arrange?err=' + encodeURIComponent('هر دو مورد را انتخاب کنید.'));
    }
    if (parentId === childId) {
      return res.redirect('/admin/definitions/hierarchy/arrange?err=' + encodeURIComponent('یک سمت نمی‌تواند بالادست خودش باشد.'));
    }

    // Verify both exist
    const chk = await hierarchyPool.query(
      'SELECT id FROM org_nodes WHERE id = ANY($1::int[])',
      [[parentId, childId]]
    );
    if ((chk.rows || []).length !== 2) {
      return res.redirect('/admin/definitions/hierarchy/arrange?err=' + encodeURIComponent('سمت انتخاب‌شده معتبر نیست.'));
    }

    // LOOP CHECK (edges):
    // If proposed parent is in descendants of child, then child->parent makes a cycle.
    const loopSql =
      "WITH RECURSIVE sub AS ( " +
      "  SELECT child_id FROM org_node_edges WHERE parent_id = $1 " +
      "  UNION ALL " +
      "  SELECT e.child_id FROM org_node_edges e JOIN sub s ON e.parent_id = s.child_id " +
      ") " +
      "SELECT 1 AS hit FROM sub WHERE child_id = $2 LIMIT 1";

    const loop = await hierarchyPool.query(loopSql, [childId, parentId]);
    if ((loop.rows || []).length) {
      return res.redirect('/admin/definitions/hierarchy/arrange?err=' + encodeURIComponent('این انتخاب باعث لوپ در درخت می‌شود و مجاز نیست.'));
    }

    // Only update org_nodes parent_id; DB triggers will handle edges and levels
    // (bria_org_nodes_to_edges + bria_after_edges_sync)
    await hierarchyPool.query(
      'UPDATE org_nodes SET parent_id=$1 WHERE id=$2',
      [parentId, childId]
    );

    return res.redirect('/admin/definitions/hierarchy/arrange?ok=' + encodeURIComponent('رابطه ثبت شد.'));
  } catch (e) {
    console.error('hierarchy link POST error:', e);
    const errMsg = String(e.message || e);
    // Check for cycle errors from DB triggers
    if (errMsg.includes('cycle detected') || errMsg.includes('Invalid hierarchy')) {
      return res.redirect('/admin/definitions/hierarchy/arrange?err=' + encodeURIComponent('این انتخاب باعث لوپ در درخت می‌شود و مجاز نیست.'));
    }
    return res.redirect('/admin/definitions/hierarchy/arrange?err=' + encodeURIComponent('خطا در ثبت رابطه.'));
  }
});

// -----------------------------
// Raw DB health pages (existing)
// -----------------------------
router.get('/definitions/baskets', (req, res) => {
  return res.redirect(
    '/admin/definitions?warn=' + encodeURIComponent('این بخش حذف شده')
  );
});

router.post('/definitions/baskets/:id/delete', (req, res) => {
  return res.redirect(
    '/admin/definitions?warn=' + encodeURIComponent('این بخش حذف شده')
  );
});

router.get('/definitions/brands', async (req, res) => {
  let dbOk = false;
  let dbError = null;

  try {
    await pool.query('SELECT 1');
    dbOk = true;
  } catch (e) {
    dbError = e && e.message ? e.message : String(e);
    console.error('[DEFINITIONS] GET /admin/definitions/brands error:', e);
  }

  return res.render('definitions/brands', {
    user: getSessionUser(req),
    dbOk,
    dbError,
    routePath: '/admin/definitions/brands',
  });
});

router.get('/definitions/teams', async (req, res) => {
  let dbOk = false;
  let dbError = null;

  try {
    await pool.query('SELECT 1');
    dbOk = true;
  } catch (e) {
    dbError = e && e.message ? e.message : String(e);
    console.error('[DEFINITIONS] GET /admin/definitions/teams error:', e);
  }

  return res.render('definitions/teams', {
    user: getSessionUser(req),
    dbOk,
    dbError,
    routePath: '/admin/definitions/teams',
  });
});

router.get('/definitions/products', async (req, res) => {
  let dbOk = false;
  let dbError = null;

  try {
    await pool.query('SELECT 1');
    dbOk = true;
  } catch (e) {
    dbError = e && e.message ? e.message : String(e);
    console.error('[DEFINITIONS] GET /admin/definitions/products error:', e);
  }

  return res.render('definitions/products', {
    user: getSessionUser(req),
    dbOk,
    dbError,
    routePath: '/admin/definitions/products',
  });
});

module.exports = router;
